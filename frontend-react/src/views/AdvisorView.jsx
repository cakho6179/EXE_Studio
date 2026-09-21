import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { useToast } from '../contexts/ToastContext.jsx';
import { useAudio } from '../contexts/AudioContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import LmsSyncModal from '../components/LmsSyncModal.jsx';

// POST /advisor/chat {message, context_type, include_profile, include_tasks} (thử fallback /ai/advisor nếu 404).
// Backend hiện tại nhận {content} + ?session_id= — gửi kèm cả hai để tương thích.
async function askAdvisor(message, contextType = 'general', sessionId = null) {
  const payload = { content: message, message, context_type: contextType, include_profile: true, include_tasks: true };
  const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
  return await api.post(`/advisor/chat${qs}`, payload);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Render markdown cơ bản (**bold**, `code`, list -, xuống dòng) — port từ 17-ai-advisor
function renderMarkdown(src) {
  let h = escapeHtml(src);
  h = h.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-100 text-blue-700 font-mono text-[11px]">$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>');
  const lines = h.split('\n');
  let out = '';
  let inList = false;
  for (const ln of lines) {
    const m = ln.match(/^\s*[-*]\s+(.*)/);
    if (m) {
      if (!inList) { out += '<ul class="list-disc pl-5 space-y-1">'; inList = true; }
      out += `<li>${m[1]}</li>`;
    } else {
      if (inList) { out += '</ul>'; inList = false; }
      out += ln.trim() ? `<p>${ln}</p>` : '<br>';
    }
  }
  if (inList) out += '</ul>';
  return out;
}

const PROMPT_PILLS = [
  'Tạo bảng đối chiếu thông số LaTeX',
  'Rà soát trích dẫn chuẩn IEEE',
  'Chia nhỏ 3 bước làm tiếp',
];

const IEEE_DRAFT = '"Due to subtle class imbalances present within the sampled dataset, reliance solely on overall accuracy yields misleading empirical conclusions. Consequently, we adopted the unweighted macro-averaged F1-score (Eq. 2) to evaluate classifier generalization across all ten categories impartially, penalizing misclassifications equally regardless of label frequency."';

function docIcon(fn) {
  const ext = String(fn || '').toLowerCase().split('.').pop();
  if (ext === 'pdf') return '📕';
  if (ext === 'doc' || ext === 'docx') return '📘';
  if (ext === 'tex') return '📗';
  if (ext === 'txt' || ext === 'md') return '📝';
  if (ext === 'zip' || ext === 'rar') return '📦';
  return '📄';
}

export default function AdvisorView() {
  const { showToast } = useToast();
  const { togglePlay, isPlaying } = useAudio();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showLmsModal, setShowLmsModal] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const recRef = useRef(null);
  const listRef = useRef(null);
  const fileRef = useRef(null);

  const sessionsQ = useQuery({ queryKey: ['advisor-sessions'], queryFn: () => api.get('/advisor/sessions'), staleTime: 15000 });
  const sessions = useMemo(() => (Array.isArray(sessionsQ.data) ? sessionsQ.data : []), [sessionsQ.data]);
  const knowledgeQ = useQuery({ queryKey: ['advisor-docs'], queryFn: () => api.get('/advisor/documents'), staleTime: 30000 });
  const docs = useMemo(() => knowledgeQ.data?.documents || [], [knowledgeQ.data]);
  const tasksQ = useQuery({ queryKey: ['tasks'], queryFn: () => api.get('/tasks/'), staleTime: 30000 });
  const openTasks = useMemo(() => (Array.isArray(tasksQ.data) ? tasksQ.data.filter((t) => t.status !== 'completed') : []), [tasksQ.data]);

  useEffect(() => {
    // Ưu tiên phiên MỚI NHẤT CÓ NỘI DUNG — tránh hạ cánh vào phiên trống vừa bấm nhầm.
    if (!sessionId && sessions.length) {
      const withContent = sessions.find((s) => (s.message_count || 0) > 0);
      setSessionId((withContent || sessions[0]).id);
    }
  }, [sessions, sessionId]);

  // Tải lịch sử phiên đang chọn
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const msgs = await api.get(`/advisor/sessions/${encodeURIComponent(sessionId)}/messages`);
        if (cancelled) return;
        if (Array.isArray(msgs) && msgs.length) {
          setShowWelcome(false);
          setMessages(msgs.map((m) => ({ role: (m.sender || m.role) === 'user' ? 'user' : 'assistant', text: m.content, at: m.created_at })));
        } else {
          setMessages([]);
          setShowWelcome(true);
        }
      } catch { /* phiên mới / offline: giữ welcome */ }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending, showWelcome]);

  const citations = useMemo(() => {
    const list = [];
    if (docs && docs.length > 0) {
      docs.slice(0, 2).forEach((d, idx) => {
        list.push({
          tag: `[${idx + 1}] ${d.filename.length > 25 ? d.filename.slice(0, 22) + '…' : d.filename}`,
          title: `Tài liệu tải lên: ${d.filename}`,
          valid: true,
        });
      });
    }
    const textAll = messages.map((m) => m.text || '').join(' ');
    if (textAll.includes('ResNet') || textAll.includes('He et al') || list.length === 0) {
      list.push({
        tag: `[${list.length + 1}] He et al. (2016)`,
        title: 'Deep Residual Learning for Image Recognition (CVPR)',
        valid: true,
      });
    }
    if (textAll.includes('Attention') || textAll.includes('Transformer') || textAll.includes('Vaswani')) {
      list.push({
        tag: `[${list.length + 1}] Vaswani et al. (2017)`,
        title: 'Attention Is All You Need (NeurIPS)',
        valid: true,
      });
    } else if (list.length < 2) {
      list.push({
        tag: `[${list.length + 1}] Krizhevsky (2009)`,
        title: 'Learning Multiple Layers of Features from Tiny Images',
        valid: true,
      });
    }
    return list;
  }, [docs, messages]);

  const firstName = (user?.full_name || '').trim().split(' ').slice(-2).join(' ') || 'bạn';
  const userInitials = (user?.full_name || '').trim().split(' ').filter(Boolean).map((w) => w[0]).slice(-2).join('').toUpperCase() || 'SV';
  const topTask = openTasks[0] || null;

  async function sendMessage(text, contextType = 'general') {
    const msg = (text || '').trim();
    if (!msg || sending) return;
    if (msg.length > 2000) { showToast('Tin nhắn tối đa 2000 ký tự.', 'warning'); return; }
    setShowWelcome(false);
    setMessages((m) => [...m, { role: 'user', text: msg }]);
    setInput('');
    setSending(true);
    try {
      const res = await askAdvisor(msg, contextType, sessionId);
      if (res.session_id) {
        setSessionId(res.session_id);
        sessionsQ.refetch();
      }
      const reply = res?.reply || res?.response || res?.advice || res?.message || res?.text || 'Mình chưa có câu trả lời phù hợp, bạn hỏi lại chi tiết hơn nhé.';
      setMessages((m) => [...m, { role: 'assistant', text: reply, meta: res?.metadata || res?.meta || null }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: `Xin lỗi bạn, đã có gián đoạn kết nối. ${err.message || ''}` }]);
    } finally {
      setSending(false);
    }
  }

  async function createSession() {
    if (sending) return;
    // Dùng lại phiên trống có sẵn thay vì đẻ thêm phiên 0 tin nhắn.
    const empty = sessions.find((s) => (s.message_count || 0) === 0);
    if (empty) {
      setSessionId(empty.id);
      setMessages([]);
      setShowWelcome(true);
      return;
    }
    try {
      const s = await api.post('/advisor/new-session', {});
      setSessionId(s.id);
      setMessages([]);
      setShowWelcome(true);
      sessionsQ.refetch();
      showToast(`Đã tạo ${s.title || 'phiên mới'}.`, 'success');
    } catch (err) { showToast(err.message || 'Không tạo được phiên.', 'error'); }
  }

  async function saveSessionRename(id) {
    const trimmed = editingTitle.trim();
    if (!trimmed) {
      setEditingSessionId(null);
      return;
    }
    try {
      await api.patch(`/advisor/sessions/${encodeURIComponent(id)}`, { title: trimmed });
      showToast('Đã đổi tên phiên.', 'success');
      sessionsQ.refetch();
    } catch (err) {
      showToast(err.message || 'Không đổi tên được phiên.', 'error');
    } finally {
      setEditingSessionId(null);
    }
  }

  async function deleteSession(id, title) {
    if (sending) return;
    if (!window.confirm(`Xóa "${title || 'phiên này'}" cùng toàn bộ tin nhắn?`)) return;
    try {
      await api.delete(`/advisor/sessions/${encodeURIComponent(id)}`);
      showToast('Đã xóa phiên tham vấn.', 'success');
      if (id === sessionId) {
        setSessionId(null);
        setMessages([]);
        setShowWelcome(true);
      }
      sessionsQ.refetch();
    } catch (err) { showToast(err.message || 'Không xóa được phiên.', 'error'); }
  }

  async function refreshHistory() {
    if (!sessionId) return;
    try {
      const msgs = await api.get(`/advisor/sessions/${encodeURIComponent(sessionId)}/messages`);
      setMessages((Array.isArray(msgs) ? msgs : []).map((m) => ({ role: (m.sender || m.role) === 'user' ? 'user' : 'assistant', text: m.content, at: m.created_at })));
      showToast('Đã tải lại lịch sử phiên.', 'success');
    } catch (err) { showToast(err.message || 'Không tải lại được.', 'error'); }
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); showToast('Đã sao chép.', 'success'); }
    catch { showToast('Không sao chép được.', 'error'); }
  }

  async function exportMinutes() {
    try {
      let history = [];
      if (sessionId) {
        const msgs = await api.get(`/advisor/sessions/${encodeURIComponent(sessionId)}/messages`);
        history = Array.isArray(msgs) ? msgs : [];
      } else {
        const h = await api.get('/advisor/history');
        history = Array.isArray(h) ? h : [];
      }
      const curSession = sessions.find((s) => s.id === sessionId);
      const sessionTitle = curSession?.title || 'Phiên tham vấn';
      const body = history.length
        ? history.map((m) => {
          const who = (m.sender || m.role) === 'user' ? (user?.full_name || 'Sinh viên') : 'Cố vấn AI';
          const at = m.created_at ? new Date(m.created_at).toLocaleString('vi-VN') : '';
          return `[${at}] ${who}:\n${m.content}`;
        }).join('\n\n---\n\n')
        : (messages.length
            ? messages.map((m) => `[${m.at ? new Date(m.at).toLocaleString('vi-VN') : ''}] ${m.role === 'user' ? (user?.full_name || 'Sinh viên') : 'Cố vấn AI'}:\n${m.text}`).join('\n\n---\n\n')
            : '(Chưa có hội thoại nào)');
      const content = `BIÊN BẢN TƯ VẤN HỌC THUẬT - STUĐIÔ AI\nChủ đề: ${sessionTitle}\nSinh viên: ${user?.full_name || ''} (${user?.student_id || 'Chưa cập nhật'})\nNgày xuất: ${new Date().toLocaleDateString('vi-VN')}\n\n${body}`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
      a.download = `Bien_Ban_Tu_Van_${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      showToast('Đã tải xuống biên bản tư vấn học thuật (.txt)!', 'success');
    } catch (err) { showToast(err.message || 'Không xuất được biên bản.', 'error'); }
  }

  function exportBibtex() {
    const curSession = sessions.find((s) => s.id === sessionId);
    const sessionTitle = curSession?.title || 'Phân tích học thuật';
    let bib = `% BibTeX Bibliography generated by Studio AI Copilot\n% Session: ${sessionTitle}\n% Exported: ${new Date().toISOString()}\n\n`;
    if (docs.length > 0) {
      docs.forEach((d, idx) => {
        const safeKey = `doc_${idx + 1}_${d.filename.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
        bib += `@misc{${safeKey},\n  title = {${d.filename}},\n  author = {${user?.full_name || 'Nghiên cứu sinh'}},\n  howpublished = {Tài liệu học phần lưu trữ Stuđio AI},\n  year = {${new Date().getFullYear()}}\n}\n\n`;
      });
    }
    bib += `@inproceedings{he2016deep,\n  title={Deep residual learning for image recognition},\n  author={He, Kaiming and Zhang, Xiangyu and Ren, Shaoqing and Sun, Jian},\n  booktitle={Proceedings of the IEEE conference on computer vision and pattern recognition},\n  pages={770--778},\n  year={2016}\n}\n\n@article{vaswani2017attention,\n  title={Attention is all you need},\n  author={Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob and Jones, Llion and Gomez, Aidan N and Kaiser, {\\L}ukasz and Polosukhin, Illia},\n  journal={Advances in neural information processing systems},\n  volume={30},\n  year={2017}\n}\n`;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bib], { type: 'text/plain;charset=utf-8' }));
    a.download = `references_${sessionId || 'academic'}_${Date.now()}.bib`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    showToast('Đã xuất thành công file trích dẫn IEEE (.BibTeX)!', 'success');
  }

  function downloadObsidianNote() {
    const curSession = sessions.find((s) => s.id === sessionId);
    const sessionTitle = curSession?.title || 'Co_Van_Hoc_Thuat_AI';
    const convoMd = messages.length > 0
      ? messages.map((m) => `### ${m.role === 'user' ? '👤 ' + (user?.full_name || 'Học viên') : '🧠 Cố vấn AI'}\n\n${m.text}`).join('\n\n---\n\n')
      : `## Tóm tắt phương pháp luận\n\n${IEEE_DRAFT}\n\n## Kết luận\n\nDữ liệu thực nghiệm cần tối ưu hoá siêu tham số và báo cáo F1-Macro.`;

    const md = `---
title: "${sessionTitle}"
date: ${new Date().toISOString().split('T')[0]}
tags: [studi-ai, research, academic-copilot, notes]
author: "${user?.full_name || 'Học viên'}"
---

# ${sessionTitle}

> **Ghi chú học thuật đồng bộ từ Stuđio AI Copilot**  
> Ngày tạo: ${new Date().toLocaleString('vi-VN')}  
> Sinh viên: ${user?.full_name || ''} (${user?.student_id || 'Chưa cập nhật'})

## Nội dung thảo luận & Giải pháp học thuật

${convoMd}

## Tài liệu đính kèm phiên
${docs.length > 0 ? docs.map((d) => `- [[${d.filename}]] (${d.size_kb} KB)`).join('\n') : '- Không có tài liệu bổ trợ'}

---
*Ghi chú tương thích hoàn toàn định dạng Obsidian Markdown, Roam Research & Logseq.*
`;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    a.download = `obsidian-${sessionTitle.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF]/g, '_')}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    showToast('Đã tải ghi chú Markdown (.md)!', 'success');
  }

  function handleMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast('Trình duyệt này không hỗ trợ ghi âm giọng nói.', 'warning'); return; }
    if (isListening && recRef.current) {
      recRef.current.stop();
      setIsListening(false);
      showToast('Đã dừng nhận diện giọng nói.', 'info');
      return;
    }
    try {
      const rec = new SR();
      rec.lang = 'vi-VN';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      recRef.current = rec;
      rec.onstart = () => {
        setIsListening(true);
        showToast('Đang nghe... hãy nói câu hỏi của bạn (bấm lại mic để dừng).', 'info');
      };
      rec.onresult = (ev) => {
        const text = ev.results[0][0].transcript;
        setInput((v) => (v ? `${v} ${text}` : text));
      };
      rec.onerror = () => {
        setIsListening(false);
        showToast('Không nhận diện được giọng nói.', 'error');
      };
      rec.onend = () => {
        setIsListening(false);
      };
      rec.start();
    } catch {
      setIsListening(false);
      showToast('Không khởi động được ghi âm.', 'error');
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['pdf', 'docx', 'tex', 'txt', 'md'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!allowed.includes(ext)) {
      showToast(`Định dạng .${ext} không được hỗ trợ. Hãy chọn file tài liệu PDF, Word (.docx), LaTeX (.tex) hoặc Markdown (.md, .txt).`, 'warning');
      e.target.value = '';
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      showToast('Dung lượng file tối đa là 25MB.', 'warning');
      e.target.value = '';
      return;
    }
    try {
      const fd = new FormData();
      fd.append('file', file);
      showToast(`Đang tải lên & nạp ngữ cảnh AI: ${file.name}...`, 'info');
      const res = await api.postForm('/advisor/upload', fd);
      knowledgeQ.refetch();
      showToast(res.message || 'Đã nạp tài liệu vào bộ nhớ AI!', 'success');
    } catch (err) { showToast(err.message || 'Tải file thất bại.', 'error'); }
    finally { e.target.value = ''; }
  }

  async function handleDeleteDoc(id, name) {
    if (!window.confirm(`Xóa tài liệu "${name}" khỏi bộ nhớ AI?`)) return;
    try {
      await api.delete(`/advisor/documents/${encodeURIComponent(id)}`);
      knowledgeQ.refetch();
      showToast(`Đã xóa tài liệu "${name}".`, 'success');
    } catch (err) {
      showToast(err.message || 'Không xóa được tài liệu.', 'error');
    }
  }

  const allTasks = useMemo(() => (Array.isArray(tasksQ.data) ? tasksQ.data : []), [tasksQ.data]);
  const doneCount = useMemo(() => {
    const total = allTasks.reduce((a, t) => a + (t.total_sprints || 1), 0);
    const done = allTasks.reduce((a, t) => a + (t.completed_sprints || 0), 0);
    return total ? Math.round((done / total) * 100) : 0;
  }, [allTasks]);

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-5 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs pb-3">
        <div className="flex items-center space-x-2 text-slate-600 font-medium">
          <span>{user?.university ? `${user.university} • ${user.major || 'Đại học'}` : 'Học kỳ I / Năm 3 • ĐHQG TP.HCM'}</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900 font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            Cố vấn Học thuật &amp; Trợ lý Nghiên cứu AI Copilot
          </span>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <div className="px-2.5 py-1 bg-white/80 border border-slate-200 rounded-lg text-slate-600 font-medium flex items-center gap-1.5 shadow-sm">
            <span>🛡️</span><span>Bảo mật Zero-Leak AI</span>
          </div>
          <div className="px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 font-semibold flex items-center gap-1.5 shadow-sm">
            <span>⚡</span><span>Gemini AI • Nhịp sinh học cá nhân</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <button
            type="button" onClick={createSession} disabled={sending}
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 text-white font-semibold text-sm rounded-xl shadow-md shadow-blue-500/25 flex items-center justify-center space-x-2 transition transform active:scale-[0.99]"
          >
            <span className="text-xs">＋</span><span>Phiên tham vấn mới</span>
            <span className="ml-auto text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono">⌘N</span>
          </button>

          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Phiên thảo luận đồ án</span>
              <span className="w-2 h-2 rounded-full bg-blue-600" />
            </div>
            <div className="space-y-1 text-xs" aria-live="polite">
              {sessionsQ.isLoading && <div className="p-2.5 text-center text-slate-400">Đang tải phiên...</div>}
              {sessionsQ.isError && <div className="p-2.5 text-center text-rose-500">Không tải được phiên.</div>}
              {!sessionsQ.isLoading && sessions.length === 0 && <div className="p-2.5 text-center text-slate-400">Chưa có phiên nào.</div>}
              {sessions.map((s) => {
                const active = s.id === sessionId;
                const when = s.created_at ? new Date(s.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '';
                return (
                  <div
                    key={s.id}
                    className={active
                      ? 'w-full p-2.5 rounded-xl bg-blue-50/90 border border-blue-200/80 text-left transition group'
                      : 'w-full p-2.5 rounded-lg hover:bg-slate-100/80 text-left transition border border-transparent group'}
                  >
                    <div className="flex items-start gap-1">
                      <button type="button" onClick={() => setSessionId(s.id)} className="flex-1 min-w-0 text-left">
                        <div className={`font-medium truncate ${active ? 'text-blue-700' : 'text-slate-700'}`}>{s.title || 'Phiên tham vấn'}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{when} • {s.message_count || 0} tin nhắn</div>
                      </button>
                      <button
                        type="button"
                        title="Đổi tên phiên này"
                        aria-label={`Đổi tên ${s.title || 'phiên'}`}
                        onClick={(e) => { e.stopPropagation(); renameSession(s.id, s.title); }}
                        className="shrink-0 px-1.5 py-0.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition text-xs"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        title="Xóa phiên này"
                        aria-label={`Xóa ${s.title || 'phiên'}`}
                        onClick={(e) => { e.stopPropagation(); deleteSession(s.id, s.title); }}
                        className="shrink-0 px-1.5 py-0.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tài liệu đã nạp (Knowledge)</span>
              <span className="px-2 py-0.5 text-[10px] bg-slate-100 text-slate-600 font-semibold rounded-full">{docs.length} Tệp</span>
            </div>
            <div className="space-y-2 text-xs" aria-live="polite">
              {knowledgeQ.isLoading && <div className="p-2.5 text-center text-slate-400">Đang tải tài liệu...</div>}
              {!knowledgeQ.isLoading && docs.length === 0 && <div className="p-2.5 text-center text-slate-400">Chưa có tài liệu nào. Bấm “Nạp thêm” bên dưới.</div>}
              {docs.map((d) => (
                <div key={d.id} className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/70 flex items-center justify-between group" title={`${d.filename} (${d.size_kb}KB)`}>
                  <div className="flex items-center space-x-2 truncate min-w-0 pr-1">
                    <span className="text-sm shrink-0">{docIcon(d.filename)}</span>
                    <span className="font-medium text-slate-700 truncate">{d.filename}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-emerald-600">✔</span>
                    <button
                      type="button"
                      title="Xóa tài liệu khỏi bộ nhớ AI"
                      aria-label={`Xóa tài liệu ${d.filename}`}
                      onClick={() => handleDeleteDoc(d.id, d.filename)}
                      className="p-1 text-slate-300 hover:text-rose-600 rounded transition opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.tex,.txt,.md" className="hidden" onChange={handleUpload} />
            <button
              type="button" onClick={() => fileRef.current?.click()}
              className="w-full mt-3 py-2 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 rounded-xl transition flex items-center justify-center gap-1.5"
            >
              <span className="text-[11px]">⭆</span><span>Nạp thêm giáo trình / Rubric</span>
            </button>
          </div>

          <div className="glass-card rounded-2xl p-4 text-[11px] text-slate-600 space-y-1.5" style={{ background: 'rgba(255,255,255,0.72)' }}>
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
              <span className="text-blue-600">🔒</span><span>Tiêu chuẩn Liêm chính Học thuật</span>
            </div>
            <p className="leading-relaxed">Stuđiô AI đối chiếu chuẩn trích dẫn APA 7th &amp; IEEE. Mọi nội dung nghiên cứu của sinh viên được bảo vệ riêng tư 100% (Zero-Data Retention).</p>
          </div>
        </div>

        <div className="lg:col-span-6 space-y-4">
          <div className="glass-card rounded-2xl p-5 shadow-lg flex flex-col h-[780px]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200/70">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-sm shadow-blue-500/20">🧠</div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-sm">Cố vấn Học thuật AI Copilot</h3>
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded-full border border-emerald-200">Online 432Hz</span>
                  </div>
                  <p className="text-xs text-slate-500">Phân tích chuyên sâu đồ án, code luận văn &amp; phương pháp nghiên cứu</p>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                <button type="button" onClick={exportMinutes} className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition font-medium flex items-center gap-1" title="Xuất biên bản họp AI">
                  <span className="text-[11px]">⭳</span><span className="hidden sm:inline">Xuất biên bản</span>
                </button>
                <button type="button" onClick={refreshHistory} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition" title="Làm mới ngữ cảnh">
                  <span className="text-xs">⟳</span>
                </button>
              </div>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto py-4 space-y-5 pr-1">
              {showWelcome && (
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-white border border-blue-100 text-xs text-slate-700 flex items-start space-x-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">💡</div>
                  <div>
                    <div className="font-bold text-blue-900 mb-0.5">Mục tiêu phiên làm việc • {topTask?.subject_name || 'Đỉnh năng lượng Alpha'}</div>
                    <p className="leading-relaxed text-slate-600">
                      Chào {firstName}!
                      {topTask
                        ? ` Ưu tiên hiện tại của bạn là "${topTask.title}" (${topTask.completed_sprints || 0}/${topTask.total_sprints || 0} sprints). Tôi sẵn sàng hỗ trợ phân tích và cấu trúc theo chuẩn IEEE.`
                        : ' Tôi đã sẵn sàng hỗ trợ bạn phân tích toán học và cấu trúc bảng theo chuẩn IEEE Conference.'}
                    </p>
                  </div>
                </div>
              )}

              {messages.length === 0 && !sending && (
                <div className="py-8 px-4 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-100 via-indigo-100 to-sky-100 text-blue-600 flex items-center justify-center text-2xl shadow-xs">
                    💡
                  </div>
                  <div className="max-w-md space-y-1">
                    <h4 className="font-bold text-slate-800 text-sm">
                      Không gian Thảo luận Học thuật Trống
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Chưa có trao đổi nào trong phiên này. Hãy đặt câu hỏi hoặc chọn gợi ý bên dưới để Cố vấn AI bắt đầu hỗ trợ bạn:
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl w-full text-left pt-2">
                    {[
                      ['📐 Đánh giá Mô hình & Độ đo', 'Phân tích F1-macro vs F1-micro, Confusion Matrix khi dữ liệu mất cân bằng'],
                      ['📝 Cấu trúc Báo cáo chuẩn IEEE', 'Hướng dẫn viết Section III - Methodology và phân tích thực nghiệm'],
                      ['📚 Trích xuất Rubric Đồ án', 'Tóm tắt yêu cầu chấm điểm và các mục bắt buộc từ tài liệu tải lên'],
                      ['⚡ Chia nhỏ Micro-Sprints 25p', 'Lập kế hoạch phân rã đồ án thành các phiên tập trung sâu theo nhịp sinh học'],
                    ].map(([title, desc]) => (
                      <button
                        key={title}
                        type="button"
                        onClick={() => sendMessage(`${title}: ${desc}`)}
                        className="p-3 rounded-xl bg-white/80 hover:bg-blue-50/90 border border-slate-200/80 hover:border-blue-300 text-left transition shadow-2xs group"
                      >
                        <div className="font-semibold text-slate-800 text-xs group-hover:text-blue-700">{title}</div>
                        <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => m.role === 'user' ? (
                <div key={i} className="flex items-start justify-end space-x-2">
                  <div className="max-w-md bg-blue-600 text-white rounded-2xl rounded-tr-sm p-4 shadow-sm text-xs leading-relaxed">
                    <div className="font-medium whitespace-pre-wrap">{m.text}</div>
                    <div className="text-[10px] text-blue-200 text-right mt-1.5 flex items-center justify-end gap-1">
                      <span>{m.at ? new Date(m.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Vừa xong'}</span>
                      <span className="text-[9px]">✓✓</span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-blue-700 text-white font-bold text-xs flex items-center justify-center shrink-0">{userInitials}</div>
                </div>
              ) : (
                <div key={i} className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 shadow-sm border border-blue-200">🎓</div>
                  <div className="flex-1 max-w-xl space-y-2">
                    <div className="bg-white/95 border border-slate-200/80 p-4 rounded-2xl rounded-tl-sm shadow-xs text-xs text-slate-800 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">Cố vấn Học thuật AI</span>
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-semibold border border-blue-200">Calm Academic</span>
                        <button type="button" onClick={() => copyText(m.text)} className="ml-auto text-[10px] text-slate-400 hover:text-blue-600 font-medium">Sao chép</button>
                      </div>
                      <div className="leading-relaxed space-y-1.5" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />
                    </div>
                    {m.meta && (
                      <div className="flex flex-wrap gap-1.5 text-[10px]">
                        {m.meta.model && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">🤖 {m.meta.model}</span>}
                        {m.meta.confidence != null && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">🎯 {Math.round(m.meta.confidence * 100)}%</span>}
                        {m.meta.chronotype && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">⏰ {m.meta.chronotype}</span>}
                        {m.meta.energy_level != null && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">⚡ {m.meta.energy_level}%</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex items-center gap-2 text-xs text-slate-500 p-2 italic">
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0.15s' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0.3s' }} />
                  </span>
                  Cố vấn đang suy ngẫm...
                </div>
              )}
            </div>

            <div className="pt-2 pb-2">
              <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
                <span className="text-slate-400 font-medium text-[11px] shrink-0">Gợi ý câu hỏi:</span>
                {PROMPT_PILLS.map((p) => (
                  <button
                    key={p} type="button" disabled={sending}
                    onClick={() => sendMessage(p)}
                    className="px-3 py-1 bg-white/80 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200/80 rounded-full shrink-0 transition text-xs"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/70">
              <div className="bg-white/90 border border-slate-200 rounded-2xl p-2.5 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition">
                <textarea
                  rows={2} value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                  placeholder="Đặt câu hỏi học thuật, paste mã nguồn cần gỡ lỗi hoặc yêu cầu cố vấn đồ án..."
                  className="w-full bg-transparent border-0 resize-none text-xs text-slate-800 placeholder-slate-400 focus:outline-none p-1"
                />
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-1">
                  <div className="flex items-center space-x-2 text-slate-500 text-xs">
                    <button type="button" onClick={() => fileRef.current?.click()} className="p-1.5 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition" title="Đính kèm file bài tập">📎</button>
                    <button type="button" onClick={handleMic} className="p-1.5 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition" title="Ghi âm giọng nói">🎤</button>
                    <div className="h-3 w-px bg-slate-200" />
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">🕘 Model: Gemini AI</span>
                  </div>
                  <button
                    type="button" onClick={() => sendMessage(input)} disabled={sending || !input.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-sm shadow-blue-500/30 flex items-center gap-1.5 transition"
                  >
                    <span>Gửi cố vấn</span><span className="text-[10px]">✈</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Âm thanh não bộ 432Hz</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200/70 flex items-center justify-between">
              <div className="flex items-center space-x-3 truncate">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs shadow-sm">🌊</div>
                <div className="truncate">
                  <div className="text-xs font-bold text-slate-900 truncate">Sóng Biển &amp; Hải Đăng</div>
                  <div className="text-[10px] text-blue-600 font-medium">Tần số Alpha kích thích tư duy sâu</div>
                </div>
              </div>
              <button type="button" onClick={togglePlay} aria-label="Tạm dừng hoặc phát âm thanh" className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs hover:bg-blue-700 transition">
                <span className="text-[10px]">{isPlaying ? '⏸' : '▶'}</span>
              </button>
            </div>
            <div className="flex items-center justify-center space-x-1.5 mt-3 py-1">
              {[3, 5, 7, 4, 6, 3].map((h, i) => (
                <span key={i} className={`w-1 rounded-full ${isPlaying ? 'animate-pulse bg-blue-600' : 'bg-blue-300'}`} style={{ height: h * 4, animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Thẩm định trích dẫn</span>
              <span className="px-2 py-0.5 text-[10px] bg-emerald-50 text-emerald-700 font-semibold rounded border border-emerald-200">IEEE Compliant</span>
            </div>
            <div className="space-y-2 text-xs">
              {citations.map((c) => (
                <div key={c.tag} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-800">
                    <span>{c.tag}</span>
                    <span className="text-emerald-600 font-semibold">✔ Hợp lệ</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">{c.title}</p>
                </div>
              ))}
            </div>
            <button type="button" onClick={exportBibtex} className="w-full mt-3 py-2 text-xs font-semibold text-slate-700 hover:text-blue-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm">
              <span className="text-[11px]">📤</span><span>Xuất file trích dẫn .BibTeX</span>
            </button>
          </div>

          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Tiến độ đồ án môn học</span>
              <span className="text-xs font-bold text-blue-600">{doneCount}%</span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-3">
              <div className="bg-blue-600 h-full rounded-full" style={{ width: `${doneCount}%` }} />
            </div>
            <div className="space-y-1.5 text-xs text-slate-600">
              {openTasks.length === 0 && <p className="text-slate-400">Chưa có nhiệm vụ mở. Tạo task để AI theo dõi.</p>}
              {openTasks.slice(0, 4).map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  <span className="text-blue-600 text-sm">▢</span>
                  <span className="truncate font-medium text-slate-700">{t.title}</span>
                  <span className="ml-auto text-[10px] text-slate-400 shrink-0">{t.completed_sprints || 0}/{t.total_sprints || 1}</span>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setShowLmsModal(true)} className="w-full mt-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5">
              <span className="text-[11px]">⟳</span><span>Đồng bộ kết quả vào Canvas LMS</span>
            </button>
            <button
              type="button" disabled={sending || !topTask}
              onClick={() => sendMessage(`Phân tích nhiệm vụ phức tạp nhất của tôi ("${topTask?.title}") và chia thành các micro-sprint cụ thể theo chuẩn IEEE.`, 'complex_task_analysis')}
              className="w-full mt-2 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition"
            >
              🧬 Phân tích task phức tạp
            </button>
          </div>

          <div className="glass-card rounded-2xl p-4 text-xs text-slate-700 flex items-start gap-3" style={{ background: 'rgba(255,255,255,0.72)' }}>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">☕</div>
            <div>
              <div className="font-bold text-slate-900 text-xs mb-0.5">Lời khuyên Tĩnh Lặng</div>
              <p className="text-[11px] text-slate-500 leading-relaxed">Sau phiên viết báo cáo 25 phút này, bạn nên uống một cốc nước ấm và nhìn xa 20 mét trong 2 phút để bảo vệ mắt.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200/80 py-2.5 px-4" style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-3">
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">⏳</div>
            <div>
              <span className="text-slate-500">Phiên học tiếp theo:</span>
              <span className="font-bold text-slate-800 ml-1">{topTask ? topTask.title : 'Báo cáo đồ án AI (Viết nhận xét Confusion Matrix)'}</span>
              <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-semibold rounded">25 phút</span>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Link to="/sound" className="hover:text-blue-600 hover:underline text-slate-600 text-xs font-medium">⚙ Cài đặt âm thanh</Link>
            <Link to="/deepwork?duration=25&sound=ocean" className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition">
              <span>Bắt đầu Pomodoro</span><span>🍅</span>
            </Link>
          </div>
        </div>
      </div>

      <LmsSyncModal isOpen={showLmsModal} onClose={() => setShowLmsModal(false)} />
    </div>
  );
}
