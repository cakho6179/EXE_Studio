import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { api } from '../services/api.js';
import { useTasks } from '../hooks/useApi.js';
import LmsSyncModal from '../components/LmsSyncModal.jsx';

const FILTERS = [
  { key: 'all', label: 'Tất cả nhiệm vụ' },
  { key: 'in_progress', label: 'Đang thực hiện' },
  { key: 'high_priority', label: 'Khung giờ vàng Alpha (Ưu tiên)' },
  { key: 'complex', label: 'Đồ án lớn & Tiểu luận' },
  { key: 'completed', label: 'Đã hoàn thành' },
];

const SORTS = [
  { key: 'newest', label: 'Mới nhất' },
  { key: 'priority', label: 'Ưu tiên cao trước' },
  { key: 'progress', label: 'Tiến độ cao trước' },
  { key: 'title', label: 'Tên A–Z' },
];

const PRI_RANK = { high: 0, medium: 1, low: 2 };

const SUBJECT_PRESETS = [
  'Trí tuệ nhân tạo (CS301)',
  'CSDL Phân tán (IS210)',
  'Kỹ thuật Web (SE214)',
  'Tiểu luận Triết học Mác-Lênin',
];

function parseSubjectCode(name) {
  const m = String(name || '').match(/\(([^)]+)\)/);
  return m ? m[1].trim() : 'GEN101';
}
function shortSubject(name) {
  return String(name || '').split('(')[0].trim() || name;
}
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function getMinDateTimeLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function getRecommendedSlot() {
  const now = new Date();
  const h = now.getHours();
  if (h < 11) {
    return { label: 'sáng nay (09:00)', time: '09:00', dayOffset: 0 };
  } else if (h < 16) {
    return { label: 'chiều nay (14:30)', time: '14:30', dayOffset: 0 };
  } else if (h < 21) {
    return { label: 'tối nay (20:00)', time: '20:00', dayOffset: 0 };
  } else {
    return { label: 'sáng mai (08:30)', time: '08:30', dayOffset: 1 };
  }
}

export default function TasksView() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');

  // AI box cột phải
  const [aiText, setAiText] = useState('');
  const [aiDeadline, setAiDeadline] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  // Notes
  const [noteText, setNoteText] = useState('');
  const [newSprintTitle, setNewSprintTitle] = useState({});
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [showLmsModal, setShowLmsModal] = useState(false);

  // Modal tạo / sửa (port 12-task-modal)
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [mTitle, setMTitle] = useState('');
  const [mDesc, setMDesc] = useState('');
  const [mSubject, setMSubject] = useState(SUBJECT_PRESETS[0]);
  const [customSubjects, setCustomSubjects] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('studi_custom_subjects') || '[]');
    } catch {
      return [];
    }
  });
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectInput, setNewSubjectInput] = useState('');
  const [mDeadline, setMDeadline] = useState('');
  const [mPriority, setMPriority] = useState('high');
  const [mComplexity, setMComplexity] = useState('simple');
  const [mAiOn, setMAiOn] = useState(false);
  const [mAutoScheduleStep1, setMAutoScheduleStep1] = useState(false);
  const [mSyncCalendar, setMSyncCalendar] = useState(true);
  const [mSaving, setMSaving] = useState(false);
  const [mErr, setMErr] = useState('');
  const [mAiPreview, setMAiPreview] = useState(null);
  const [mFiles, setMFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const tasksQ = useTasks();
  const allTasks = useMemo(() => (Array.isArray(tasksQ.data) ? tasksQ.data : []), [tasksQ.data]);

  const availableSubjects = useMemo(() => {
    const fromTasks = allTasks.map((t) => (t.subject_code ? `${t.subject_name} (${t.subject_code})` : t.subject_name)).filter(Boolean);
    const combined = [...SUBJECT_PRESETS, ...fromTasks, ...customSubjects];
    return Array.from(new Set(combined));
  }, [allTasks, customSubjects]);

  const notesQ = useQuery({ queryKey: ['notes'], queryFn: () => api.get('/notes/') });
  const notes = notesQ.data?.notes || [];

  const pulseQ = useQuery({
    queryKey: ['pulse'],
    queryFn: () => api.get('/circadian/pulse').catch(() => null),
    staleTime: 5 * 60 * 1000,
  });
  const pulse = pulseQ.data;

  const adviceQ = useQuery({
    queryKey: ['tasks-advice'],
    queryFn: async () => {
      const [p, list] = await Promise.all([
        api.get('/circadian/pulse').catch(() => null),
        api.get('/tasks/').catch(() => []),
      ]);
      return { pulse: p, top: (Array.isArray(list) ? list.filter((t) => t.status !== 'completed') : [])[0] };
    },
  });

  // ---- mutations task (luôn invalidate ['tasks']) ----
  const toggleSubtask = useMutation({
    mutationFn: (id) => api.patch(`/tasks/subtasks/${id}/toggle`),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
      qc.invalidateQueries({ queryKey: ['focus-summary'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['analytics-dashboard'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      showToast(updated?.is_completed ? 'Hoàn thành 1 micro-sprint! Năng lượng duy trì tốt.' : 'Đã chuyển về trạng thái đang làm.', 'success');
    },
    onError: (err) => showToast(err.message || 'Không cập nhật được.', 'error'),
  });
  const deleteSubtask = useMutation({
    mutationFn: (id) => api.delete(`/tasks/subtasks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['analytics-dashboard'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      showToast('Đã xóa micro-sprint.', 'success');
    },
    onError: (err) => showToast(err.message || 'Không xóa được.', 'error'),
  });
  // FIX: backend có sẵn POST /tasks/{id}/subtasks nhưng UI không gọi — không thể thêm
  // sprint vào task có sẵn (phải xóa tạo lại task)
  const addSubtask = useMutation({
    mutationFn: ({ taskId, title }) => api.post(`/tasks/${taskId}/subtasks`, {
      title: title.trim() || 'Micro-sprint tập trung 25p',
      estimated_minutes: 25,
      pomodoro_count: 1,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['analytics-dashboard'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      showToast('Đã thêm micro-sprint vào nhiệm vụ.', 'success');
    },
    onError: (err) => showToast(err.message || 'Không thêm được.', 'error'),
  });
  const deleteTask = useMutation({
    mutationFn: (id) => api.delete(`/tasks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['analytics-dashboard'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      showToast('Đã xóa nhiệm vụ thành công!', 'success');
    },
    onError: (err) => showToast(err.message || 'Không xóa được.', 'error'),
  });
  const toggleTask = useMutation({
    mutationFn: ({ id, currentStatus }) => {
      const next = currentStatus === 'completed' ? 'in_progress' : 'completed';
      return api.patch(`/tasks/${id}`, { status: next });
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
      qc.invalidateQueries({ queryKey: ['focus-summary'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['analytics-dashboard'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      showToast(
        updated?.status === 'completed'
          ? '🎉 Đã hoàn thành nhiệm vụ và các micro-sprints!'
          : 'Đã mở lại nhiệm vụ.',
        'success',
      );
    },
    onError: (err) => showToast(err.message || 'Không cập nhật được trạng thái nhiệm vụ.', 'error'),
  });

  const addNote = useMutation({
    mutationFn: (text) => api.post('/notes/', {
      title: text.length > 60 ? text.slice(0, 60) + '...' : text,
      content: text,
    }),
    onSuccess: () => {
      setNoteText('');
      qc.invalidateQueries({ queryKey: ['notes'] });
    },
    onError: (err) => showToast(err.message || 'Không lưu được.', 'error'),
  });
  const delNote = useMutation({
    mutationFn: (id) => api.delete(`/notes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
    onError: (err) => showToast(err.message || 'Không xóa được.', 'error'),
  });
  const updateNote = useMutation({
    mutationFn: ({ id, title, content }) => api.patch(`/notes/${id}`, { title, content }),
    onSuccess: () => {
      setEditingNoteId(null);
      setEditingNoteText('');
      qc.invalidateQueries({ queryKey: ['notes'] });
      showToast('Đã cập nhật ghi chú thành công!', 'success');
    },
    onError: (err) => showToast(err.message || 'Không cập nhật được.', 'error'),
  });

  // ---- lọc / tìm / sắp xếp ----
  let filtered = allTasks;
  if (filter === 'in_progress') filtered = filtered.filter((t) => t.status !== 'completed');
  else if (filter === 'completed') filtered = filtered.filter((t) => t.status === 'completed');
  else if (filter === 'high_priority') filtered = filtered.filter((t) => t.priority === 'high' && t.status !== 'completed');
  else if (filter === 'complex') filtered = filtered.filter((t) => t.complexity === 'complex' && t.status !== 'completed');
  const q = query.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(
      (t) =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.subject_name || '').toLowerCase().includes(q) ||
        (t.subject_code || '').toLowerCase().includes(q),
    );
  }
  filtered = [...filtered].sort((a, b) => {
    if (sort === 'priority') return (PRI_RANK[a.priority] ?? 9) - (PRI_RANK[b.priority] ?? 9);
    if (sort === 'progress') {
      const pa = a.total_sprints ? a.completed_sprints / a.total_sprints : 0;
      const pb = b.total_sprints ? b.completed_sprints / b.total_sprints : 0;
      return pb - pa;
    }
    if (sort === 'title') return (a.title || '').localeCompare(b.title || '', 'vi');
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  const counts = {
    all: allTasks.length,
    in_progress: allTasks.filter((t) => t.status !== 'completed').length,
    high_priority: allTasks.filter((t) => t.priority === 'high' && t.status !== 'completed').length,
    complex: allTasks.filter((t) => t.complexity === 'complex' && t.status !== 'completed').length,
    completed: allTasks.filter((t) => t.status === 'completed').length,
  };

  // ---- gộp task trùng tên (giữ bản tiến độ cao nhất, xóa phần còn lại) ----
  const [cleaning, setCleaning] = useState(false);
  const dupGroups = (() => {
    const byTitle = {};
    allTasks.forEach((t) => {
      if (t.status === 'completed') return;
      const key = `${(t.title || '').trim().toLowerCase()}|${(t.subject_name || '').trim().toLowerCase()}`;
      (byTitle[key] = byTitle[key] || []).push(t);
    });
    return Object.values(byTitle).filter((g) => g.length > 1);
  })();

  async function cleanupDuplicates() {
    if (!dupGroups.length || cleaning) return;
    const n = dupGroups.reduce((a, g) => a + g.length - 1, 0);
    if (!window.confirm(`Tìm thấy ${n} nhiệm vụ trùng tên. Giữ lại bản tiến độ cao nhất mỗi nhóm và xóa ${n} bản thừa?`)) return;
    setCleaning(true);
    try {
      const res = await api.post('/tasks/deduplicate');
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
      showToast(res.message || `Đã dọn ${res.removed_count || n} nhiệm vụ trùng.`, 'success');
    } catch {
      // Fallback nếu kết nối mạng tạm thời gián đoạn
      for (const g of dupGroups) {
        const sorted = [...g].sort((a, b) => (b.completed_sprints || 0) - (a.completed_sprints || 0));
        for (const t of sorted.slice(1)) {
          try {
            await api.delete(`/tasks/${t.id}`);
          } catch {
            /* bỏ qua task xóa lỗi */
          }
        }
      }
      qc.invalidateQueries({ queryKey: ['tasks'] });
      showToast(`Đã dọn ${n} nhiệm vụ trùng.`, 'success');
    } finally {
      setCleaning(false);
    }
  }
  const totalCount = allTasks.length;
  const completedCount = allTasks.filter((t) => t.status === 'completed').length;
  const pctAll = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const totalSteps = allTasks.reduce((a, t) => a + (t.subtasks?.length || 0), 0);
  const doneSteps = allTasks.reduce((a, t) => a + (t.subtasks?.filter((s) => s.is_completed).length || 0), 0);
  const pctSteps = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
  const urgent = allTasks.filter((t) => {
    if (!t.deadline || t.status === 'completed') return false;
    const diff = new Date(t.deadline) - new Date();
    return diff > 0 && diff < 48 * 3600 * 1000;
  });

  const nextSub = (() => {
    for (const t of allTasks) {
      const s = (t.subtasks || []).find((x) => !x.is_completed);
      if (s) return { t, s };
    }
    return null;
  })();

  // ---- AI decompose box ----
  const quotaQ = useQuery({
    queryKey: ['billing-quota'],
    queryFn: () => api.get('/billing/quota').catch(() => null),
    staleTime: 30000,
  });
  const quota = quotaQ.data || {};
  const quotaExhausted = quota.limit >= 0 && (quota.remaining ?? 1) <= 0 && quota.limit !== -1;
  const runAiDecompose = async () => {
    const title = aiText.trim();
    if (title.length < 5) {
      showToast('Nhập đề bài ít nhất 5 ký tự để AI phân rã.', 'warning');
      return;
    }
    setAiLoading(true);
    try {
      const res = await api.post('/tasks/ai-decompose', { title });
      setAiResult(res);
      quotaQ.refetch();
    } catch (err) {
      if (String(err.message || '').includes('Nâng cấp Pro')) {
        showToast('Hết lượt AI miễn phí tháng này! Nâng cấp Pro trong trang Hồ sơ để không giới hạn.', 'warning');
      } else {
        showToast(err.message || 'AI phân rã thất bại.', 'error');
      }
    } finally {
      setAiLoading(false);
    }
  };
  const saveAiTask = async () => {
    if (!aiResult || aiSaving) return;
    setAiSaving(true);
    let deadlineIso = null;
    if (aiDeadline && typeof aiDeadline === 'string' && aiDeadline.trim()) {
      const trimmed = aiDeadline.trim();
      const picked = new Date(`${trimmed}T23:59:00`);
      if (!Number.isNaN(picked.getTime())) {
        if (picked.getTime() < Date.now()) {
          showToast('Hạn nộp không được ở quá khứ.', 'warning');
          return;
        }
        deadlineIso = picked.toISOString();
      } else {
        deadlineIso = trimmed;
      }
    }
    const matchedSubj = SUBJECT_PRESETS.find((p) =>
      aiText.toLowerCase().includes(p.toLowerCase().split('(')[0].trim()) ||
      aiText.toLowerCase().includes(parseSubjectCode(p).toLowerCase()),
    ) || SUBJECT_PRESETS[0];

    try {
      const created = await api.post('/tasks/', {
        title: aiResult.task_title || aiText.trim(),
        description: aiResult.summary_advice || '',
        subject_name: aiResult.subject_name || shortSubject(matchedSubj),
        subject_code: aiResult.subject_code || parseSubjectCode(matchedSubj),
        priority: aiResult.priority || 'high',
        complexity: aiResult.complexity || 'complex',
        deadline: deadlineIso,
        subtasks: (aiResult.subtasks || []).map((s) => ({
          title: s.title,
          estimated_minutes: s.estimated_minutes || 25,
          pomodoro_count: s.pomodoro_count || 1,
          recommended_circadian_window: s.recommended_circadian_window || 'Khung giờ vàng chiều (14:00 - 16:30)',
        })),
      });

      // Tự động phân bổ micro-sprints vào 4 ngày tới trong lịch (F27)
      // FIX: đặt vào khung giờ vàng ĐẦU TIÊN theo tuýp sinh học của user (backend trả
      // golden_hour_range dạng "08:30 - 11:30 & ...") — trước đây gán cứng 14:30 cho mọi người,
      // user cú đêm bị sắp học 14:30 ngoài khung 20:30-23:30 của họ
      if (created?.id && Array.isArray(aiResult.subtasks) && aiResult.subtasks.length > 0) {
        const firstRange = String(pulse?.golden_hour_range || '').split(' & ')[0] || '';
        const [gs, ge] = firstRange.split(' - ');
        const startT = /^\d{2}:\d{2}$/.test(gs || '') ? gs : '14:00';
        const endT = /^\d{2}:\d{2}$/.test(ge || '') ? ge : '15:30';
        for (let i = 0; i < Math.min(aiResult.subtasks.length, 4); i++) {
          const d = new Date();
          d.setDate(d.getDate() + i);
          const dateStr = d.toLocaleDateString('en-CA');
          await api.post('/schedule/events', {
            task_id: created.id,
            title: `Bước ${i + 1}: ${aiResult.subtasks[i].title}`,
            description: `Micro-sprint ${i + 1} của ${aiResult.task_title || aiText.trim()}`,
            event_date: dateStr,
            start_time: startT,
            end_time: endT,
            event_type: 'deep_work',
            is_circadian_optimized: true,
          }).catch(() => null);
        }
        qc.invalidateQueries({ queryKey: ['timeline'] });
      }

      showToast(`Đã lưu nhiệm vụ với ${(aiResult.subtasks || []).length} micro-sprints và gán lịch trình!`, 'success');
      setAiResult(null);
      setAiText('');
      qc.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err) {
      showToast(err.message || 'Không lưu được nhiệm vụ.', 'error');
    } finally {
      setAiSaving(false);
    }
  };

  // ---- Lưu mỗi micro-sprint thành 1 nhiệm vụ nhỏ riêng ----
  const [splitSaving, setSplitSaving] = useState(false);
  const saveAiSplit = async () => {
    const subs = aiResult?.subtasks || [];
    if (!subs.length || splitSaving) return;
    const matchedSubj = SUBJECT_PRESETS.find((p) =>
      aiText.toLowerCase().includes(p.toLowerCase().split('(')[0].trim()) ||
      aiText.toLowerCase().includes(parseSubjectCode(p).toLowerCase()),
    ) || SUBJECT_PRESETS[0];
    setSplitSaving(true);
    let done = 0;
    try {
      for (const s of subs) {
        await api.post('/tasks/', {
          title: s.title,
          description: `Micro-sprint tách từ: ${aiResult.task_title || aiText.trim()}`,
          subject_name: aiResult.subject_name || shortSubject(matchedSubj),
          subject_code: aiResult.subject_code || parseSubjectCode(matchedSubj),
          priority: aiResult.priority || 'medium',
          complexity: 'simple',
          deadline: null,
          subtasks: [{
            title: s.title,
            estimated_minutes: s.estimated_minutes || 25,
            pomodoro_count: s.pomodoro_count || 1,
            recommended_circadian_window: s.recommended_circadian_window || 'Khung giờ vàng chiều (14:00 - 16:30)',
          }],
        });
        done += 1;
      }
      showToast(`Đã lưu ${done} nhiệm vụ nhỏ!`, 'success');
      setAiResult(null);
      setAiText('');
      qc.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err) {
      showToast(done > 0 ? `Đã lưu ${done}/${subs.length} task, lỗi ở task tiếp theo: ${err.message}` : (err.message || 'Không lưu được.'), done > 0 ? 'warning' : 'error');
      qc.invalidateQueries({ queryKey: ['tasks'] });
    } finally {
      setSplitSaving(false);
    }
  };
  // ---- Modal tạo / sửa ----
  const handleFilesAdded = async (newFiles) => {
    const ALLOWED_EXTS = ['.pdf', '.docx', '.tex', '.txt', '.md'];
    const invalid = newFiles.filter((f) => !ALLOWED_EXTS.some((ext) => f.name.toLowerCase().endsWith(ext)));
    if (invalid.length > 0) {
      showToast(`Chỉ chấp nhận các định dạng PDF, DOCX, ZIP, TXT, MD, TEX. Đã bỏ qua ${invalid.length} tệp không hợp lệ.`, 'warning');
    }
    const valid = newFiles.filter((f) => ALLOWED_EXTS.some((ext) => f.name.toLowerCase().endsWith(ext)));
    const ok = valid.filter((f) => f.size <= 25 * 1024 * 1024);
    if (ok.length !== valid.length) {
      showToast('Có file vượt quá 25MB đã bị bỏ qua.', 'warning');
    }
    for (const f of ok) {
      if (f.name.endsWith('.txt') || f.name.endsWith('.md') || f.name.endsWith('.tex')) {
        try {
          const txt = await f.text();
          if (txt && !mDesc.trim()) {
            setMDesc(txt.slice(0, 800));
            showToast(`Đã tự động trích xuất nội dung từ ${f.name} vào mô tả bài tập!`, 'info');
          }
        } catch { /* bỏ qua */ }
      }
    }
    setMFiles((prev) => [...prev, ...ok]);
    if (mAiPreview) setMAiPreview(null);
  };

  const handleAddNewSubject = () => {
    const trimmed = newSubjectInput.trim();
    if (!trimmed) {
      setAddingSubject(false);
      return;
    }
    if (!customSubjects.includes(trimmed)) {
      const updated = [...customSubjects, trimmed];
      setCustomSubjects(updated);
      try {
        localStorage.setItem('studi_custom_subjects', JSON.stringify(updated));
      } catch { /* bỏ qua */ }
    }
    setMSubject(trimmed);
    setNewSubjectInput('');
    setAddingSubject(false);
    showToast(`Đã thêm môn học mới: ${trimmed}`, 'success');
  };

  const openCreate = () => {
    setEditing(null);
    setMTitle('');
    setMDesc('');
    setMSubject(availableSubjects[0] || SUBJECT_PRESETS[0]);
    setMDeadline('');
    setMPriority('high');
    setMComplexity('simple');
    setMAiOn(false);
    setMAutoScheduleStep1(false);
    setMSyncCalendar(true);
    setMAiPreview(null);
    setMFiles([]);
    setMErr('');
    setAddingSubject(false);
    setNewSubjectInput('');
    try {
      const raw = localStorage.getItem('studi_task_draft');
      if (raw) {
        const d = JSON.parse(raw);
        if (d.title) setMTitle(d.title);
        if (d.description) setMDesc(d.description);
        if (d.deadline) setMDeadline(d.deadline);
        if (d.complexity) setMComplexity(d.complexity);
        if (d.priority) setMPriority(d.priority);
        if (d.title || d.description) showToast('Đã khôi phục bản nháp trước đó.', 'info');
      }
    } catch { /* bỏ qua */ }
    setModalOpen(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setMTitle(t.title || '');
    setMDesc(t.description || '');
    setMSubject(t.subject_code ? `${t.subject_name || ''} (${t.subject_code})` : (t.subject_name || availableSubjects[0] || SUBJECT_PRESETS[0]));
    setMDeadline(toLocalInput(t.deadline));
    setMPriority(t.priority || 'high');
    setMComplexity(t.complexity || 'medium');
    setMAiOn(false);
    setMAiPreview(null);
    setMFiles([]);
    setMErr('');
    setAddingSubject(false);
    setNewSubjectInput('');
    setModalOpen(true);
  };

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  const saveDraft = () => {
    try {
      localStorage.setItem('studi_task_draft', JSON.stringify({
        title: mTitle, description: mDesc, deadline: mDeadline,
        complexity: mComplexity, priority: mPriority, savedAt: Date.now(),
      }));
      if (mTitle.trim()) {
        api.post('/notes/', {
          title: `[Bản nháp nhiệm vụ] ${mTitle.trim()}`,
          content: `Hạn chót: ${mDeadline || 'Chưa đặt'} | Mức: ${mPriority} | Độ phức tạp: ${mComplexity}\n${mDesc || ''}`,
          color_tag: 'blue',
        }).then(() => {
          qc.invalidateQueries({ queryKey: ['notes'] });
        }).catch(() => null);
      }
      showToast('Đã lưu bản nháp nhiệm vụ (đồng bộ vào tài khoản)!', 'success');
    } catch {
      showToast('Không lưu được bản nháp.', 'error');
    }
  };

  const previewAiInModal = async () => {
    const title = mTitle.trim();
    if (title.length < 2) {
      setMErr('Vui lòng nhập tên đề tài/nhiệm vụ (tối thiểu 2 ký tự).');
      return;
    }
    setMSaving(true);
    setMErr('');
    try {
      let fullDesc = mDesc.trim();
      if (mFiles.length > 0) {
        fullDesc += `\n[Tài liệu đính kèm: ${mFiles.map((f) => f.name).join(', ')}]`;
      }
      const res = await api.post('/tasks/ai-decompose', {
        title,
        description: fullDesc,
        subject: shortSubject(mSubject),
        complexity: mComplexity,
      });
      setMAiPreview(res);
      showToast('AI đã phân tích đề bài và đề xuất lộ trình micro-sprints!', 'success');
    } catch (err) {
      setMErr(err.message || 'AI phân rã thất bại.');
    } finally {
      setMSaving(false);
    }
  };

  const submitModal = async () => {
    setMErr('');
    const title = mTitle.trim();
    if (!title) { setMErr('Vui lòng nhập tên đề tài/nhiệm vụ.'); return; }
    if (title.length < 2) { setMErr('Tên nhiệm vụ quá ngắn (tối thiểu 2 ký tự).'); return; }
    let deadlineIso = null;
    if (mDeadline && typeof mDeadline === 'string' && mDeadline.trim()) {
      const trimmed = mDeadline.trim();
      const picked = new Date(trimmed);
      if (!Number.isNaN(picked.getTime())) {
        if (picked.getTime() < Date.now() - 24 * 3600 * 1000) {
          setMErr('Hạn nộp không được quá 24 giờ trong quá khứ.');
          return;
        }
        deadlineIso = picked.toISOString();
      } else {
        deadlineIso = trimmed;
      }
    }
    setMSaving(true);
    try {
      let uploaded = 0;
      for (const f of mFiles) {
        try {
          const fd = new FormData();
          fd.append('file', f);
          await api.postForm('/advisor/upload', fd);
          uploaded += 1;
        } catch { /* tiếp tục */ }
      }
      if (editing) {
        await api.patch(`/tasks/${editing.id}`, {
          title,
          description: mDesc.trim() || null,
          subject_name: shortSubject(mSubject),
          subject_code: parseSubjectCode(mSubject),
          deadline: deadlineIso,
          priority: mPriority,
          complexity: mComplexity,
        });
        showToast('Đã cập nhật nhiệm vụ thành công!', 'success');
      } else {
        let subtasks = [];
        let summary = mDesc.trim();
        if (mFiles.length > 0) {
          const fileNote = `\n[Tài liệu đính kèm: ${mFiles.map((f) => f.name).join(', ')}]`;
          summary = (summary + fileNote).trim();
        }
        const detectedSubj = availableSubjects.find((p) =>
          (title + ' ' + mDesc).toLowerCase().includes(p.toLowerCase().split('(')[0].trim())
        );
        const effectiveSubj = (mSubject === availableSubjects[0] && detectedSubj) ? detectedSubj : mSubject;

        if (mAiOn) {
          const ai = mAiPreview || await api.post('/tasks/ai-decompose', {
            title,
            description: summary,
            subject: shortSubject(effectiveSubj),
            complexity: mComplexity,
          });
          summary = summary || ai.summary_advice || '';
          subtasks = (ai.subtasks || []).map((s) => ({
            title: s.title,
            estimated_minutes: s.estimated_minutes || 25,
            pomodoro_count: s.pomodoro_count || 1,
            recommended_circadian_window: s.recommended_circadian_window || 'Khung giờ vàng chiều (14:00 - 16:30)',
          }));
        }

        const createdTask = await api.post('/tasks/', {
          title,
          description: summary || '',
          subject_name: shortSubject(effectiveSubj),
          subject_code: parseSubjectCode(effectiveSubj),
          deadline: deadlineIso,
          priority: mPriority,
          complexity: mComplexity,
          subtasks,
        });

        // Tự động phân bổ micro-sprints vào khung giờ vàng thật
        if (createdTask?.id && subtasks.length > 0 && mAutoScheduleStep1) {
          const slot = getRecommendedSlot();
          const stepsToSchedule = (mComplexity === 'complex' || mComplexity === 'medium') ? Math.min(subtasks.length, 3) : 1;
          for (let i = 0; i < stepsToSchedule; i++) {
            const d = new Date();
            d.setDate(d.getDate() + slot.dayOffset + i);
            const dateStr = d.toLocaleDateString('en-CA');
            const dur = subtasks[i].estimated_minutes || 25;
            const [sh, sm] = slot.time.split(':').map(Number);
            const endMinTotal = sh * 60 + sm + dur;
            const eh = Math.floor(endMinTotal / 60) % 24;
            const em = endMinTotal % 60;
            const endStr = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
            await api.post('/schedule/events', {
              task_id: createdTask.id,
              title: `Bước ${i + 1}: ${subtasks[i].title}`,
              description: `Micro-sprint ${i + 1} của đồ án ${title}`,
              event_date: dateStr,
              start_time: slot.time,
              end_time: endStr,
              event_type: 'deep_work',
              is_circadian_optimized: true,
            }).catch(() => null);
          }
          qc.invalidateQueries({ queryKey: ['timeline'] });
          qc.invalidateQueries({ queryKey: ['notifications'] });
        }

        if (mSyncCalendar) {
          api.post('/schedule/lms-sync', { provider: 'canvas' }).catch(() => null);
        }

        showToast(
          (mAiOn
            ? `Đã phân rã và lưu thành công ${subtasks.length} micro-sprints!`
            : 'Đã lưu nhiệm vụ thành công!')
          + (uploaded ? ` Đã tải lên ${uploaded} tài liệu.` : ''),
          'success',
        );
        try { localStorage.removeItem('studi_task_draft'); } catch { /* bỏ qua */ }
      }
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['analytics-dashboard'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      setModalOpen(false);
    } catch (err) {
      setMErr(err.message || 'Không tạo được nhiệm vụ.');
    } finally {
      setMSaving(false);
    }
  };

  const submitNote = () => {
    const t = noteText.trim();
    if (!t) return;
    addNote.mutate(t);
  };

  return (
    <div className="max-w-[1440px] w-full mx-auto p-4 md:p-6 lg:p-8 space-y-6 pb-28">
      {/* Sync bar */}
      <section className="glass-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-slate-700">{user?.university ? `${user.university}${user.major ? ` • ${user.major}` : ''}` : 'Học kỳ I / Năm 3 • ĐHQG TP.HCM'}</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-800 font-semibold">Quản lý Nhiệm vụ &amp; Đồ án</span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100/80 text-blue-700 border border-blue-200">
            ⚡ AI TASK DECONSTRUCTOR V3.2
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLmsModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white/90 hover:bg-white border border-slate-300/80 rounded-xl shadow-2xs transition"
          >
            <span>🔄</span>
            <span>Đồng bộ LMS Canvas &amp; Google Classroom</span>
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition"
          >
            <span>+ Thêm nhiệm vụ mới</span>
          </button>
        </div>
      </section>

      {/* Banner */}
      <section className="glass-card rounded-3xl p-6 relative overflow-hidden border border-white/80 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
          <div className="max-w-3xl space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span>CALM TASK DECONSTRUCTION &amp; ULTRADIAN RHYTHM</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">Nhiệm vụ &amp; Chia nhỏ Thông minh AI</h1>
            <p className="text-slate-600 text-sm leading-relaxed">
              AI tự động phân rã đồ án, bài tập lớn thành các <span className="text-blue-700 font-semibold">micro-sprints 25 phút Pomodoro</span> theo
              nhịp sinh học, giúp loại bỏ cảm giác choáng ngợp, chống trì hoãn và duy trì trạng thái thư thái sâu khi học tập.
            </p>
          </div>
          <div className="glass-pill bg-blue-50/70 border border-blue-200/70 rounded-2xl p-4 flex items-center gap-4 shrink-0">
            <div className="w-12 h-12 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold text-lg">🍅</div>
            <div>
              <div className="text-xs text-slate-500 font-medium">Khung giờ vàng Alpha</div>
              <div className="text-base font-bold text-blue-900">{pulse?.golden_hour_range || '14:30 - 16:30 • Đỉnh tư duy'}</div>
              <div className="text-[11px] text-emerald-600 font-semibold">
                Độ sẵn sàng giải quyết bài khó: {pulseQ.isPending ? 'Đang tải…' : pulse ? `${pulse.pulse_percent}%` : 'Chưa có dữ liệu'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-5" id="tasks-stats">
        <div className="glass-card rounded-2xl p-5 border border-white/80 shadow-2xs hover:shadow-sm transition">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-3 font-medium">
            <span>TỔNG NHIỆM VỤ TUẦN</span>
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">📋</span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold text-slate-900">{tasksQ.isPending ? '--' : `${totalCount} việc`}</span>
            <span className="text-xs text-slate-500 font-normal">(Đã xong {completedCount} • Còn {totalCount - completedCount})</span>
          </div>
          <div className="w-full bg-slate-200/80 rounded-full h-2 mb-2 overflow-hidden">
            <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${pctAll}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-slate-500">
            <span className="text-blue-600 font-medium">Tiến độ {pctAll}%</span>
            <span>Chỉ tiêu tuần cân bằng</span>
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 border border-white/80 shadow-2xs hover:shadow-sm transition">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-3 font-medium">
            <span>MICRO-SPRINTS HÔM NAY</span>
            <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">⏱</span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold text-slate-900">
              {totalSteps} bước
            </span>
            <span className="text-xs text-emerald-600 font-semibold">
              ✓ {doneSteps} hoàn tất
            </span>
          </div>
          <div className="w-full bg-slate-200/80 rounded-full h-2 mb-2 overflow-hidden">
            <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${pctSteps}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-slate-500">
            <span className="text-indigo-600 font-medium">{doneSteps}/{totalSteps} micro-sprints đã xong</span>
            <span>Đúng nhịp Ultradian</span>
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 border border-white/80 shadow-2xs hover:shadow-sm transition">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-3 font-medium">
            <span>NĂNG LƯỢNG SINH HỌC</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">⚡</span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold text-emerald-600">{pulseQ.isPending ? '…' : pulse?.is_golden_hour ? 'Đỉnh Alpha' : pulse ? 'Ổn định' : 'Chưa đo'}</span>
            <span className="text-xs text-slate-500 font-normal">({pulse?.golden_hour_range || 'làm test Chronotype để biết khung giờ vàng'})</span>
          </div>
          <div className="w-full bg-slate-200/80 rounded-full h-2 mb-2 overflow-hidden">
            <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${pulse?.pulse_percent ?? 0}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-slate-500">
            <span className="text-emerald-700 font-medium">Tập trung {pulseQ.isPending ? '…' : pulse ? `${pulse.pulse_percent}%` : '—'}</span>
            <span>Sẵn sàng đồ án khó</span>
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 border border-white/80 shadow-2xs hover:shadow-sm transition">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-3 font-medium">
            <span>HẠN CHÓT CẦN CHÚ Ý</span>
            <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600">⚠️</span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold text-rose-600">{urgent.length} Đồ án</span>
            <span className="text-xs text-rose-700 font-medium">trong 48 giờ tới</span>
          </div>
          <div className="w-full bg-slate-200/80 rounded-full h-2 mb-2 overflow-hidden">
            <div className="bg-rose-500 h-2 rounded-full transition-all" style={{ width: `${urgent.length ? 80 : 8}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-slate-500">
            <span className="text-rose-600 font-semibold truncate max-w-[60%]">
              {urgent[0] ? urgent[0].title.slice(0, 32) : 'Không có hạn gấp'}
            </span>
            <span>{urgent[1] ? urgent[1].title.slice(0, 12) : ''}</span>
          </div>
        </div>
      </section>

      {/* Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="col-span-1 lg:col-span-8 space-y-5" id="tasks-left-col">
          <div className="glass-card rounded-2xl p-2" id="task-filter-tabs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-xs overflow-x-auto">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={
                      filter === f.key
                        ? 'px-4 py-2 rounded-xl bg-blue-600 text-white font-medium shadow-xs whitespace-nowrap'
                        : 'px-4 py-2 rounded-xl text-slate-600 hover:bg-white/80 font-medium transition whitespace-nowrap'
                    }
                  >
                    {f.key === 'high_priority' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                        <span>{f.label} ({counts[f.key] ?? 0})</span>
                      </span>
                    ) : (`${f.label} (${counts[f.key] ?? 0})`)}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-slate-400 font-medium hidden sm:inline pr-2 whitespace-nowrap">
                {filtered.length}/{allTasks.length} nhiệm vụ
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm theo tên, môn học..."
                aria-label="Tìm nhiệm vụ"
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 bg-white/80 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                aria-label="Sắp xếp nhiệm vụ"
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white/80 text-xs text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            {dupGroups.length > 0 && (
              <div className="mt-2 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200/70 text-[11px]">
                <span className="text-amber-800 font-medium">
                  Phát hiện {dupGroups.reduce((a, g) => a + g.length - 1, 0)} nhiệm vụ trùng tên (do bấm tạo nhiều lần).
                </span>
                <button
                  type="button"
                  onClick={cleanupDuplicates}
                  disabled={cleaning}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-[11px] font-semibold transition"
                >
                  {cleaning ? 'Đang dọn…' : 'Gộp task trùng'}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4" aria-live="polite">
            {tasksQ.isPending ? (
              <div className="glass-card rounded-2xl p-8 text-center space-y-3">
                <span className="animate-spin inline-block w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full" />
                <p className="text-xs text-slate-500">Đang tải nhiệm vụ từ hệ thống...</p>
              </div>
            ) : tasksQ.isError ? (
              <div className="glass-card rounded-2xl p-8 text-center space-y-3">
                <p className="text-base font-semibold text-rose-600">Không tải được nhiệm vụ.</p>
                <button
                  type="button"
                  onClick={() => tasksQ.refetch()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition"
                >
                  Thử lại
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="glass-card rounded-2xl p-8 text-center text-slate-500 space-y-3">
                <p className="text-base font-semibold">Chưa có nhiệm vụ nào trong danh mục này.</p>
                <p className="text-xs text-slate-400">Hãy thêm đồ án mới hoặc để AI Deconstructor bẻ khóa bài tập giúp bạn!</p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition"
                >
                  + Thêm bài tập ngay
                </button>
              </div>
            ) : (
              filtered.map((t) => {
                const pct = t.total_sprints > 0 ? Math.round((t.completed_sprints / t.total_sprints) * 100) : 0;
                const isDone = t.status === 'completed';
                const high = t.priority === 'high';
                return (
                  <div
                    key={t.id}
                    className={`glass-card rounded-3xl p-6 border relative transition space-y-4 ${isDone ? 'border-slate-200 opacity-80' : 'border-blue-200 shadow-md'}`}
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 gap-2 flex-wrap">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-xs font-bold px-3 py-0.5 rounded-full border ${high ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                          {high ? 'Ưu tiên cao' : 'Tiêu chuẩn'}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                          Môn: <strong>{t.subject_name}{t.subject_code ? ` (${t.subject_code})` : ''}</strong>
                        </span>
                        {t.deadline && !Number.isNaN(new Date(t.deadline).getTime()) && (
                          <span className="text-[11px] text-slate-500">
                            Hạn: {new Date(t.deadline).toLocaleDateString('vi-VN')} {new Date(t.deadline).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs bg-blue-50 text-blue-800 font-semibold px-2.5 py-0.5 rounded-full">
                          {t.completed_sprints}/{t.total_sprints} Sprints
                        </span>
                        <button
                          type="button"
                          title="Sửa nhiệm vụ"
                          onClick={() => openEdit(t)}
                          className="text-slate-400 hover:text-blue-600 p-1.5 rounded-lg transition"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          title="Xóa nhiệm vụ"
                          onClick={() => {
                            if (window.confirm('Bạn có chắc chắn muốn xóa nhiệm vụ này không?')) deleteTask.mutate(t.id);
                          }}
                          className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg transition"
                        >
                          🗑
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex items-start gap-3">
                          <button
                            type="button"
                            title={isDone ? 'Đánh dấu chưa hoàn thành' : 'Đánh dấu hoàn thành toàn bộ nhiệm vụ'}
                            onClick={() => toggleTask.mutate({ id: t.id, currentStatus: t.status })}
                            disabled={toggleTask.isPending}
                            className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition shrink-0 cursor-pointer ${
                              isDone
                                ? 'bg-emerald-500 border-emerald-500 text-white shadow-xs'
                                : 'border-slate-300 hover:border-blue-500 bg-white text-transparent hover:text-blue-300'
                            }`}
                          >
                            <span className="text-xs font-bold leading-none">✓</span>
                          </button>
                          <div className="min-w-0">
                            <h2 className={`text-base font-bold text-slate-900 ${isDone ? 'line-through text-slate-500' : ''}`}>{t.title}</h2>
                            <p className="text-xs text-slate-600 mt-1">{t.description || ''}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <span className={`text-2xl font-bold ${pct >= 100 ? 'text-emerald-600' : 'text-blue-600'}`}>{pct}%</span>
                          <p className="text-[11px] text-slate-500">{t.completed_sprints}/{t.total_sprints} bước</p>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 mt-2.5 overflow-hidden">
                        <div className={`${pct >= 100 ? 'bg-emerald-500' : 'bg-blue-600'} h-2 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center justify-between">
                        <span>Micro-Steps theo nhịp sinh học (AI Deconstructed):</span>
                        <span className="text-[11px] font-normal text-slate-500 italic">25 phút / hiệp Pomodoro</span>
                      </div>
                      <div className="space-y-2">
                        {(t.subtasks || []).length === 0 && <p className="text-xs text-slate-400 italic">Chưa có bước nhỏ nào.</p>}
                        {(t.subtasks || []).map((sub) => (
                          <div
                            key={sub.id}
                            className={`flex items-center justify-between p-2.5 rounded-xl text-xs transition border ${
                              sub.is_completed
                                ? 'bg-slate-50 border-slate-200 text-slate-400 line-through'
                                : 'bg-white/85 border-blue-100/80 text-slate-700 hover:border-blue-300'
                            }`}
                          >
                            <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                              <input
                                type="checkbox"
                                checked={!!sub.is_completed}
                                onChange={() => toggleSubtask.mutate(sub.id)}
                                className="rounded text-blue-600 focus:ring-blue-400 border-slate-300 w-4 h-4 cursor-pointer shrink-0"
                              />
                              <span className="font-medium truncate">{sub.title}</span>
                            </label>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium hidden sm:inline">
                                {sub.recommended_circadian_window || 'Khung giờ vàng'}
                              </span>
                              <span className="text-[10px] text-slate-400">{sub.estimated_minutes}p</span>
                              <button
                                type="button"
                                title="Xóa bước"
                                onClick={() => {
                                  if (window.confirm('Xóa micro-sprint này?')) deleteSubtask.mutate(sub.id);
                                }}
                                className="text-slate-300 hover:text-rose-600 transition"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                        <form
                          onSubmit={(e) => { e.preventDefault(); addSubtask.mutate({ taskId: t.id, title: newSprintTitle[t.id] || '' }); setNewSprintTitle((m) => ({ ...m, [t.id]: '' })); }}
                          className="flex items-center gap-2"
                        >
                          <input
                            value={newSprintTitle[t.id] || ''}
                            onChange={(e) => setNewSprintTitle((m) => ({ ...m, [t.id]: e.target.value }))}
                            placeholder="Thêm bước nhỏ 25p..."
                            className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-dashed border-slate-300 text-xs bg-white/60 focus:outline-none focus:border-blue-500"
                          />
                          <button
                            type="submit"
                            disabled={addSubtask.isPending || !(newSprintTitle[t.id] || '').trim()}
                            className="px-3 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 text-xs font-semibold hover:bg-blue-100 disabled:opacity-50 shrink-0"
                          >
                            + Thêm
                          </button>
                        </form>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-slate-400">
                        Tạo lúc: {t.created_at ? new Date(t.created_at).toLocaleDateString('vi-VN') : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate(`/deepwork?taskId=${t.id}&title=${encodeURIComponent(t.title)}&duration=25`)}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-105 text-white font-semibold text-xs shadow-sm flex items-center gap-1.5 transition"
                      >
                        <span>Bắt đầu Deep Work 25p</span>
                        <span>🍅</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="col-span-1 lg:col-span-4 space-y-5">
          <div className="glass-card rounded-3xl p-5 border border-blue-200/80 bg-gradient-to-br from-blue-50/70 to-indigo-50/40 shadow-sm relative">
            <div className="flex items-center gap-2 text-blue-700 text-xs font-bold mb-2">
              <span className="text-base">🧬</span>
              <span>LỜI KHUYÊN NHỊP SINH HỌC TỪ AI</span>
            </div>
            {adviceQ.data?.pulse ? (
              <>
                <p className="text-xs text-slate-700 leading-relaxed">
                  “{adviceQ.data.pulse.recommendation}”
                  {adviceQ.data.top && (
                    <>
                      {' '}Ưu tiên hiện tại: <strong className="text-blue-900 font-semibold">{adviceQ.data.top.title}</strong>{' '}
                      ({adviceQ.data.top.completed_sprints || 0}/{adviceQ.data.top.total_sprints || 0} sprints).
                    </>
                  )}
                </p>
                <div className="mt-3 pt-3 border-t border-blue-200/50 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">
                    Năng lượng {adviceQ.data.pulse.pulse_percent}%{adviceQ.data.pulse.is_golden_hour ? ' • Đang giờ vàng' : ''}
                  </span>
                  <Link to="/analytics" className="text-blue-600 font-medium hover:underline">Xem biểu đồ nhịp →</Link>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-slate-700 leading-relaxed">Đang phân tích nhịp sinh học...</p>
                <div className="mt-3 pt-3 border-t border-blue-200/50 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500" />
                  <Link to="/analytics" className="text-blue-600 font-medium hover:underline">Xem biểu đồ nhịp →</Link>
                </div>
              </>
            )}
          </div>

          <div className="glass-card rounded-3xl p-6 text-center border border-white/90 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
              <span>BƯỚC TIẾP THEO</span>
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-bold">
                {nextSub ? (nextSub.t.subject_code || nextSub.t.subject_name || 'Nhiệm vụ') : 'Xong'}
              </span>
            </div>
            <div className="py-2">
              <p className="text-sm font-bold text-slate-800 leading-snug">
                {nextSub ? nextSub.s.title : 'Đã hoàn thành hết mọi bước. Tuyệt vời!'}
              </p>
              {nextSub && (
                <p className="text-xs text-blue-600 font-medium mt-1">
                  {nextSub.s.estimated_minutes || 25} phút • {nextSub.s.recommended_circadian_window || 'Khung giờ vàng'}
                </p>
              )}
            </div>
            <div className="flex items-center justify-center mt-4">
              <button
                type="button"
                disabled={!nextSub}
                onClick={() => nextSub && navigate(
                  `/deepwork?taskId=${nextSub.t.id}&title=${encodeURIComponent(nextSub.s.title)}&duration=${nextSub.s.pomodoro_count === 2 ? 50 : 25}&sound=ocean`,
                )}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-xs shadow-sm flex items-center gap-1.5 transition"
              >
                <span>Bắt đầu Deep Work 25p</span>
                <span>🍅</span>
              </button>
            </div>
          </div>

          <div className="glass-card rounded-3xl p-5 border border-white/80 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center justify-center">✨</span>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">AI Phân Rã Đồ Án Tức Thì</h3>
            </div>
            <p className="text-xs text-slate-500">Dán đề bài lớn hoặc tên đồ án cần làm, AI sẽ bẻ nhỏ thành từng sprint 25 phút vừa sức:</p>
            <p className="text-[11px] text-slate-500">
              {quota.limit === -1 ? (
                <span className="font-semibold text-amber-700">🌟 Pro: AI không giới hạn</span>
              ) : quotaExhausted ? (
                <span className="font-semibold text-rose-600">Hết lượt AI miễn phí tháng này — <Link to="/checkout" className="underline">nâng cấp Pro</Link></span>
              ) : (
                <span>Còn <strong className="text-slate-800">{quota.remaining ?? '…'}/{quota.limit ?? '…'}</strong> lượt AI miễn phí tháng này</span>
              )}
            </p>
            <div className="space-y-2">
              <textarea
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                rows={3}
                placeholder="Ví dụ: Tiểu luận Triết học Mác-Lênin 15 trang, Cần nộp sau 5 ngày nữa..."
                className="w-full text-xs rounded-xl border-slate-200 focus:border-blue-500 focus:ring focus:ring-blue-200 bg-white/80 placeholder:text-slate-400 resize-none p-3 border"
              />
              <div className="flex items-center gap-2">
                <label htmlFor="ai-deadline-input" className="text-[11px] font-semibold text-slate-500 shrink-0">Hạn nộp:</label>
                <input
                  id="ai-deadline-input"
                  type="date"
                  value={aiDeadline}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setAiDeadline(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white/80 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={runAiDecompose}
                disabled={aiLoading}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-medium text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2"
              >
                <span>{aiLoading ? 'AI đang phân rã...' : '🪄 Bẻ nhỏ nhiệm vụ với AI'}</span>
              </button>
              {aiResult && (
                <div className="space-y-2" aria-live="polite">
                  <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-200 text-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-slate-800">{aiResult.task_title}</p>
                      {aiResult.ai_source === 'gemini' ? (
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">✨ AI Gemini</span>
                      ) : (
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold" title="API key Gemini chưa có/không dùng được nên dùng gợi ý mẫu">📌 Gợi ý mẫu</span>
                      )}
                    </div>
                    {aiResult.summary_advice && <p className="text-slate-600">{aiResult.summary_advice}</p>}
                    <ul className="space-y-1 pt-1">
                      {(aiResult.subtasks || []).map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-slate-700">
                          <span className="text-blue-600 font-bold">•</span>
                          <span>{s.title} <span className="text-slate-400">({s.estimated_minutes || 25}p)</span></span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-blue-700 font-medium">
                      ⏱ Tổng ~{aiResult.total_estimated_minutes || (aiResult.subtasks || []).length * 25} phút • {aiResult.circadian_tip || ''}
                    </p>
                    <button
                      type="button"
                      onClick={saveAiTask}
                      disabled={splitSaving || aiSaving}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-xs rounded-xl transition"
                    >
                      {aiSaving ? 'Đang lưu…' : 'Lưu thành 1 nhiệm vụ'}
                    </button>
                    <button
                      type="button"
                      onClick={saveAiSplit}
                      disabled={splitSaving || aiSaving}
                      className="w-full py-2 bg-white hover:bg-blue-50 disabled:opacity-60 text-blue-700 font-semibold text-xs rounded-xl border border-blue-200 transition"
                    >
                      {splitSaving ? 'Đang lưu từng task…' : `Tách thành ${(aiResult.subtasks || []).length} task nhỏ`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="glass-card rounded-3xl p-5 border border-white/80 shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>GHI CHÚ NHANH</span>
              <span className="text-[10px] text-slate-400 font-normal">{notes.length} ghi chú</span>
            </div>
            <div className="space-y-2 text-xs" aria-live="polite">
              {notesQ.isPending && <div className="p-2.5 text-center text-slate-400">Đang tải ghi chú...</div>}
              {!notesQ.isPending && notes.length === 0 && <div className="p-2.5 text-center text-slate-400">Chưa có ghi chú nào.</div>}
              {notes.map((n) => (
                <div key={n.id} className="p-2.5 rounded-xl bg-white/60 border border-slate-200/60">
                  {editingNoteId === n.id ? (
                    <div className="flex items-center gap-1.5 w-full">
                      <input
                        type="text"
                        value={editingNoteText}
                        onChange={(e) => setEditingNoteText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = editingNoteText.trim();
                            if (val) updateNote.mutate({ id: n.id, title: val, content: val });
                          } else if (e.key === 'Escape') {
                            setEditingNoteId(null);
                          }
                        }}
                        className="flex-1 px-2.5 py-1 rounded-lg border border-blue-400 bg-white text-xs outline-none shadow-inner"
                        autoFocus
                      />
                      <button
                        type="button"
                        title="Lưu"
                        aria-label="Lưu thay đổi ghi chú"
                        onClick={() => {
                          const val = editingNoteText.trim();
                          if (val) updateNote.mutate({ id: n.id, title: val, content: val });
                        }}
                        className="p-1 text-emerald-600 hover:text-emerald-700 font-bold text-xs cursor-pointer"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        title="Hủy"
                        aria-label="Hủy sửa ghi chú"
                        onClick={() => setEditingNoteId(null)}
                        className="p-1 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span>📝</span>
                        <span className="text-slate-700 font-medium truncate" title={n.title}>{n.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-slate-400">
                          {n.created_at ? new Date(n.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : ''}
                        </span>
                        <button
                          type="button"
                          aria-label="Sửa ghi chú"
                          title="Sửa ghi chú"
                          onClick={() => {
                            setEditingNoteId(n.id);
                            setEditingNoteText(n.title);
                          }}
                          className="text-slate-300 hover:text-blue-600 transition cursor-pointer"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          aria-label="Xóa ghi chú"
                          title="Xóa ghi chú"
                          onClick={() => { if (window.confirm('Xóa ghi chú này?')) delNote.mutate(n.id); }}
                          className="text-slate-300 hover:text-rose-600 transition cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={noteText}
                maxLength={120}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitNote(); }}
                placeholder="Ghi nhanh ý tưởng..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white/80 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
              <button
                type="button"
                aria-label="Thêm ghi chú"
                onClick={submitNote}
                className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold transition"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <aside className="sticky bottom-4 z-30 glass-panel border border-white/70 shadow-lg rounded-2xl px-6 py-2.5">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 text-sm shrink-0">⏳</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 flex-wrap">
                <span className="truncate">
                  Phiên học tiếp theo: {nextSub ? `${nextSub.t.title} (${nextSub.s.title.slice(0, 40)})` : 'Chưa có bước nào — hãy tạo nhiệm vụ đầu tiên'}
                </span>
                <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-medium">25 phút</span>
              </div>
              <p className="text-[11px] text-slate-500">Âm thanh kích hoạt sóng não: Tiếng mưa rơi tĩnh lặng &amp; Nhịp điệu Lo-Fi biển</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/sound"
              className="px-4 py-1.5 rounded-xl text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition"
            >
              ⚙️ Cài đặt âm thanh
            </Link>
            <button
              type="button"
              onClick={() => navigate(nextSub
                ? `/deepwork?taskId=${nextSub.t.id}&title=${encodeURIComponent(nextSub.s.title)}&duration=25`
                : '/deepwork')}
              className="px-5 py-1.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition"
            >
              Bắt đầu Pomodoro 🍅
            </button>
          </div>
        </div>
      </aside>

      {/* Modal tạo / sửa nhiệm vụ (port 12-task-modal) */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 overflow-y-auto bg-slate-900/40 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={editing ? 'Sửa nhiệm vụ' : 'Thêm bài tập mới'}>
          <div className="relative w-full max-w-4xl bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/80 overflow-hidden my-auto flex flex-col max-h-[92vh]">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-sky-50/70 via-white to-indigo-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center border border-blue-200/60 shadow-sm text-xl">✨</div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                      {editing ? 'Sửa Nhiệm vụ & Đồ án' : 'Thêm Bài tập & Đồ án Mới'}
                    </h2>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm">
                      🧠 AI Deconstructor v3.2
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Tự động phân tích đề bài, chia nhỏ micro-sprint 25p Pomodoro theo nhịp sinh học cá nhân</p>
                </div>
              </div>
              <button
                type="button"
                title="Đóng modal (Esc)"
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-700 text-xs sm:text-sm">
              {mErr && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium" role="alert">
                  {mErr}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                    Tên đề tài / Nhiệm vụ học tập <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={mTitle}
                    onChange={(e) => {
                      setMTitle(e.target.value);
                      if (mAiPreview) setMAiPreview(null);
                    }}
                    placeholder="Ví dụ: Tiểu luận Triết học, Báo cáo Machine Learning ResNet18..."
                    className="w-full pl-4 pr-4 py-2.5 text-sm font-medium text-slate-800 bg-white rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all placeholder:text-slate-400 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">Mô tả ngắn</label>
                  <textarea
                    value={mDesc}
                    onChange={(e) => setMDesc(e.target.value)}
                    rows={2}
                    placeholder="Mô tả mục tiêu, tài liệu tham khảo..."
                    className="w-full p-3 text-xs text-slate-700 bg-white rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">Môn học &amp; Học phần liên quan</label>
                    <span className="text-[11px] text-slate-400">Đã chọn: <strong className="text-blue-600">{mSubject}</strong></span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {availableSubjects.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setMSubject(s);
                          if (mAiPreview) setMAiPreview(null);
                        }}
                        className={
                          mSubject === s
                            ? 'px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white shadow-sm ring-2 ring-blue-500/20'
                            : 'px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200/80 transition-colors'
                        }
                      >
                        {s}
                      </button>
                    ))}
                    {!addingSubject ? (
                      <button
                        type="button"
                        onClick={() => setAddingSubject(true)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-dashed border-slate-300 text-slate-500 hover:text-blue-600 hover:border-blue-400 transition-colors cursor-pointer"
                      >
                        + Môn mới
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 bg-white border border-blue-300 rounded-lg p-1 shadow-xs">
                        <input
                          type="text"
                          value={newSubjectInput}
                          onChange={(e) => setNewSubjectInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleAddNewSubject(); }
                            if (e.key === 'Escape') { setAddingSubject(false); setNewSubjectInput(''); }
                          }}
                          placeholder="Tên môn (Mã môn)..."
                          autoFocus
                          className="px-2 py-0.5 text-xs text-slate-800 bg-transparent outline-none w-36"
                        />
                        <button
                          type="button"
                          onClick={handleAddNewSubject}
                          className="px-2 py-0.5 rounded bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700 cursor-pointer"
                        >
                          Lưu
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAddingSubject(false); setNewSubjectInput(''); }}
                          className="px-1.5 py-0.5 rounded text-slate-400 hover:text-slate-600 text-[11px] cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">Hạn chót &amp; Giờ nộp bài</label>
                    <input
                      type="datetime-local"
                      value={mDeadline}
                      min={getMinDateTimeLocal()}
                      onChange={(e) => setMDeadline(e.target.value)}
                      className="w-full text-xs font-medium text-slate-800 bg-white rounded-xl border border-slate-200 py-2 px-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                    {(() => {
                      if (!mDeadline) {
                        return (
                          <div className="p-2 rounded-lg bg-emerald-50/80 border border-emerald-200/70 text-[11px] text-emerald-800">
                            <strong>Gợi ý sinh học:</strong> Nộp trước 22:00 để duy trì chất lượng giấc ngủ sâu và chu kỳ REM tối ưu.
                          </div>
                        );
                      }
                      const d = new Date(mDeadline);
                      const hour = d.getHours();
                      const isPast22 = hour >= 22 || hour < 5;
                      return isPast22 ? (
                        <div className="p-2 rounded-lg bg-amber-50/90 border border-amber-200/80 text-[11px] text-amber-800">
                          <strong>⚠️ Lưu ý sinh học:</strong> Hạn chót {String(hour).padStart(2, '0')}:{String(d.getMinutes()).padStart(2, '0')} rơi vào khung ngủ sâu. Hãy cố gắng nộp bài trước 22:00.
                        </div>
                      ) : (
                        <div className="p-2 rounded-lg bg-emerald-50/80 border border-emerald-200/70 text-[11px] text-emerald-800">
                          <strong>✅ Nhịp sinh học chuẩn:</strong> Hạn chót hợp lý, không ảnh hưởng chu kỳ giấc ngủ đêm.
                        </div>
                      );
                    })()}
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">Mức độ ưu tiên</label>
                    <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Mức độ ưu tiên">
                      {[
                        ['high', 'Ưu tiên cao', 'bg-rose-500', 'border-rose-400 bg-rose-50/80 text-rose-700'],
                        ['medium', 'Tiêu chuẩn', 'bg-amber-400', 'border-amber-400 bg-amber-50/80 text-amber-800'],
                        ['low', 'Tự học', 'bg-slate-400', 'border-slate-400 bg-slate-100 text-slate-800'],
                      ].map(([v, label, dot, activeCls]) => (
                        <label
                          key={v}
                          className={`cursor-pointer rounded-xl p-2 text-center text-xs transition-all ${
                            mPriority === v
                              ? `border-2 ${activeCls} font-semibold shadow-xs`
                              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-medium'
                          }`}
                        >
                          <input type="radio" name="priority" value={v} checked={mPriority === v} onChange={() => setMPriority(v)} className="sr-only" />
                          <div className="flex flex-col items-center">
                            <span className={`w-2 h-2 rounded-full mb-1 ${dot}`} />
                            <span>{label}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight">
                      {mPriority === 'high' && '🔥 Trọng tâm khẩn cấp: Tự động gắn cờ báo động & ưu tiên xếp lịch học sớm nhất.'}
                      {mPriority === 'medium' && '⚖️ Nhiệm vụ tiêu chuẩn: Phân bổ đều theo tiến độ học kỳ bình thường.'}
                      {mPriority === 'low' && '🌱 Tự học & nâng cao: Tự do hoàn thành theo khung thời gian linh hoạt.'}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">Khối lượng ước lượng</label>
                    <select
                      value={mComplexity}
                      onChange={(e) => {
                        setMComplexity(e.target.value);
                        if (mAiPreview) setMAiPreview(null);
                      }}
                      className="w-full text-xs font-medium text-slate-800 bg-white rounded-xl border border-slate-200 py-2 px-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                    >
                      <option value="complex">Đồ án lớn / Bài báo (5 - 8 Sprints • ~200p)</option>
                      <option value="medium">Tiểu luận chuyên ngành (3 - 4 Sprints • ~100p)</option>
                      <option value="simple">Bài tập thực hành Lab ngắn (1 - 2 Sprints • ~50p)</option>
                      <option value="review">Ôn tập đề cương bài thi (Custom)</option>
                    </select>
                    <p className="text-[11px] text-slate-500 leading-tight">
                      {mComplexity === 'complex' && '⚡ Phân rã 5 - 8 micro-sprints: Trải đều 4-7 ngày, mỗi phiên Deep Work tối đa 90p.'}
                      {mComplexity === 'medium' && '⚡ Phân rã 3 - 4 micro-sprints: Chia đều trong 2-4 ngày để giảm tải ngợp.'}
                      {mComplexity === 'simple' && '⚡ Gọn nhẹ 1 - 2 sprints: Hoàn thành nhanh chóng trong 1-2 ngày.'}
                      {mComplexity === 'review' && '⚡ Ôn thi củng cố: Phân bổ ngắt quãng (Spaced Repetition) trước kỳ thi.'}
                    </p>
                  </div>
                </div>
              </div>

              {!editing && (
                <div className="rounded-2xl bg-gradient-to-br from-blue-50/90 via-indigo-50/50 to-white p-4 sm:p-5 border border-blue-200/80 shadow-sm relative overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-blue-100">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">
                        Kích hoạt AI Bẻ khóa Nhiệm vụ (Micro-Sprints Deconstruction){' '}
                        {mAiOn ? (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold border border-emerald-200">Bật phân rã</span>
                        ) : (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">Nhiệm vụ đơn</span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {mAiOn ? 'Chia nhỏ đồ án thành các bước không gây ngợp (mỗi bước 25 phút kèm nghỉ ngơi)' : 'Tắt: Lưu nhiệm vụ thành 1 việc duy nhất • Bật: AI tự động phân rã thành các micro-sprints'}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer" title="Bật AI phân rã, tắt để tạo nhiệm vụ đơn">
                      <input type="checkbox" checked={mAiOn} onChange={(e) => setMAiOn(e.target.checked)} className="sr-only peer" />
                      <div className="w-11 h-6 bg-slate-200 rounded-full peer-checked:bg-blue-600 relative transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
                    </label>
                  </div>
                  {mAiOn && (
                    <div className="mt-3 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={previewAiInModal}
                          disabled={mSaving || !mTitle.trim()}
                          className="px-3.5 py-1.5 rounded-xl bg-white border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-50 disabled:opacity-50 shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          {mSaving ? (
                            <>
                              <span className="animate-spin inline-block">⏳</span>
                              <span>AI đang phân tích và bẻ khóa...</span>
                            </>
                          ) : (
                            <>
                              <span>🪄</span>
                              <span>Xem trước phân rã AI ({mComplexity === 'complex' ? '5-8 sprints' : mComplexity === 'simple' ? '1-2 sprints' : '3-4 sprints'})</span>
                            </>
                          )}
                        </button>
                        {mAiPreview && (
                          <button
                            type="button"
                            onClick={() => setMAiPreview(null)}
                            className="text-xs text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                          >
                            Xóa bản xem trước
                          </button>
                        )}
                      </div>

                      {mAiPreview && (
                        <div className="p-4 rounded-xl bg-white/95 border border-blue-200 text-xs space-y-2.5 shadow-sm">
                          <div className="flex items-center justify-between border-b border-blue-100 pb-2">
                            <div>
                              <span className="font-bold text-slate-800">{mAiPreview.task_title}</span>
                              <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
                                {mAiPreview.subtasks?.length || 0} micro-sprints
                              </span>
                            </div>
                            <span className="text-[11px] text-blue-700 font-semibold">
                              ⏱ Tổng ~{mAiPreview.total_estimated_minutes || (mAiPreview.subtasks || []).length * 25} phút
                            </span>
                          </div>

                          {mAiPreview.summary_advice && (
                            <p className="text-slate-600 bg-blue-50/60 p-2 rounded-lg italic text-[11px]">
                              💡 {mAiPreview.summary_advice}
                            </p>
                          )}

                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            {(mAiPreview.subtasks || []).map((s, i) => (
                              <div key={i} className="flex items-start justify-between gap-2 p-1.5 rounded-lg bg-slate-50 hover:bg-blue-50/50 transition-colors">
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                                    {i + 1}
                                  </span>
                                  <span className="text-slate-800 font-medium">{s.title}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                                  <span className="px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 font-medium">
                                    {s.estimated_minutes || 25}p ({s.pomodoro_count || 1}🍅)
                                  </span>
                                  <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                    {s.recommended_circadian_window || 'Khung giờ chiều'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Smart Automation Checkboxes (F07) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-3 border-t border-blue-100">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={mAutoScheduleStep1}
                        onChange={(e) => setMAutoScheduleStep1(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      <span>Tự động xếp <strong>Bước 1</strong> vào <strong>Khung giờ vàng {getRecommendedSlot().label}</strong></span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={mSyncCalendar}
                        onChange={(e) => setMSyncCalendar(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      <span>Đồng bộ ngay sang <strong>Canvas LMS &amp; Lịch Google</strong></span>
                    </label>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Tài liệu đính kèm &amp; Đề bài PDF (AI tự đọc rubric)
                </label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer?.files) {
                      handleFilesAdded(Array.from(e.dataTransfer.files));
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-4 text-center transition-all ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50/80 scale-[0.99]'
                      : 'border-sky-200 hover:border-blue-400 bg-sky-50/30 hover:bg-sky-50/60'
                  }`}
                >
                  <label className="cursor-pointer block">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                        {isDragging ? '📥' : '⬆️'}
                      </div>
                      <div className="text-xs text-slate-600">
                        <span className="font-semibold text-blue-600">Nhấp để tải file lên</span> hoặc kéo thả đề cương, rubric bài tập vào đây
                      </div>
                      <p className="text-[11px] text-slate-400">Hỗ trợ PDF, DOCX, ZIP, TXT, MD, TEX (Tối đa 25MB • Tự động đọc nội dung text)</p>
                    </div>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.docx,.tex,.txt,.md"
                      className="hidden"
                      onChange={(e) => {
                        handleFilesAdded(Array.from(e.target.files || []));
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                {mFiles.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {mFiles.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-xs text-slate-700">
                        <span className="font-medium">{f.name} ({Math.round(f.size / 1024)}KB)</span>
                        <button type="button" onClick={() => setMFiles((prev) => prev.filter((_, j) => j !== i))} className="hover:text-red-500 ml-1" aria-label="Gỡ file">✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50/90 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>🌙</span>
                <span>Thiết kế theo chuẩn <strong>Ultradian Rhythm</strong>: Tối đa 90p học sâu kèm 20p giải lao.</span>
              </div>
              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                {!editing && (
                  <button
                    type="button"
                    onClick={saveDraft}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-sm"
                  >
                    Lưu bản nháp
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-all"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={submitModal}
                  disabled={mSaving}
                  className="px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 rounded-xl shadow flex items-center gap-2 transition-all active:scale-95"
                >
                  <span>{editing ? 'Lưu thay đổi' : mAiOn ? 'Tạo nhiệm vụ & Phân rã AI ngay' : 'Tạo nhiệm vụ ngay'}</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LMS Canvas & Google Classroom Sync Modal */}
      <LmsSyncModal isOpen={showLmsModal} onClose={() => setShowLmsModal(false)} />
    </div>
  );
}
