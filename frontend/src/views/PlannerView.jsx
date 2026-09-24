import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext.jsx';
import { useAudio } from '../contexts/AudioContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { api } from '../services/api.js';
import { useTasks, useTimeline } from '../hooks/useApi.js';
import LmsSyncModal from '../components/LmsSyncModal.jsx';

async function listPlans() {
  try {
    const res = await api.get('/study-plans/');
    return Array.isArray(res) ? res : res?.plans || [];
  } catch (err) {
    // Backend chưa restart sau khi thêm router study-plans → coi như rỗng, không spam lỗi.
    if (String(err.message || '').includes('404')) return [];
    throw err;
  }
}

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function weekDays() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export default function PlannerView() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { isPlaying, track, togglePlay, sleepMinutes, setSleepTimer } = useAudio();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [showLmsModal, setShowLmsModal] = useState(false);
  const [view, setView] = useState('week');
  const [planTab, setPlanTab] = useState('plans');
  const [form, setForm] = useState({ title: '', subject: '', examDate: '', hoursPerDay: 3 });
  const [genForm, setGenForm] = useState({ subject: '', examDate: '', hoursPerDay: 3, level: 'medium' });
  // Inline progress editing: maps plan.id -> draft percentage string
  const [progressEditing, setProgressEditing] = useState({});

  const cycleSleep = () => {
    const steps = [0, 15, 30, 45, 60];
    const curIdx = steps.indexOf(sleepMinutes);
    const next = steps[(curIdx + 1) % steps.length];
    setSleepTimer(next);
    showToast(next > 0 ? `Hẹn giờ tắt sau ${next} phút.` : 'Đã tắt hẹn giờ âm thanh.', 'info');
  };

  const tasksQ = useTasks();
  const tasks = useMemo(() => (Array.isArray(tasksQ.data) ? tasksQ.data : []), [tasksQ.data]);
  const timelineQ = useTimeline();
  const events = useMemo(() => (Array.isArray(timelineQ.data) ? timelineQ.data : []), [timelineQ.data]);

  const dashQ = useQuery({ queryKey: ['analytics-dashboard'], queryFn: () => api.get('/analytics/dashboard').catch(() => null) });
  const dash = dashQ.data;
  const pulseQ = useQuery({ queryKey: ['pulse'], queryFn: () => api.get('/circadian/pulse').catch(() => null), staleTime: 5 * 60 * 1000 });
  const pulse = pulseQ.data;
  const profileQ = useQuery({ queryKey: ['profile'], queryFn: () => api.get('/auth/profile').catch(() => null), staleTime: 5 * 60 * 1000 });
  const profile = profileQ.data;

  const plansQ = useQuery({ queryKey: ['study-plans'], queryFn: listPlans });
  const plans = Array.isArray(plansQ.data) ? plansQ.data : [];

  const createPlan = useMutation({
    mutationFn: () => api.post('/study-plans/', {
      title: form.title.trim(), subject: form.subject.trim(),
      exam_date: form.examDate || null, hours_per_day: Number(form.hoursPerDay) || 3,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['study-plans'] });
      setForm({ title: '', subject: '', examDate: '', hoursPerDay: 3 });
      showToast('Đã tạo kế hoạch!', 'success');
    },
    onError: (err) => showToast(err.message || 'Không tạo được.', 'error'),
  });
  const generatePlan = useMutation({
    mutationFn: () => {
      const subj = (genForm.subject || '').trim();
      if (subj.length < 2) throw new Error('Vui lòng nhập tên môn học (ít nhất 2 ký tự).');
      return api.post('/study-plans/generate', {
        subject: subj, exam_date: genForm.examDate || null,
        hours_per_day: Number(genForm.hoursPerDay) || 3, level: genForm.level,
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['study-plans'] });
      showToast(res?.message || 'AI đã tạo kế hoạch chi tiết!', 'success');
      setPlanTab('plans');
    },
    onError: (err) => showToast(err.message || 'AI chưa khả dụng.', 'error'),
  });
  const deletePlan = useMutation({
    mutationFn: (id) => api.delete(`/study-plans/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['study-plans'] });
      showToast('Đã xóa kế hoạch.', 'success');
    },
    onError: (err) => showToast(err.message || 'Lỗi.', 'error'),
  });
  const updatePlanProgress = useMutation({
    mutationFn: ({ id, progress }) => api.patch(`/study-plans/${id}`, { progress }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['study-plans'] });
      showToast('Đã cập nhật tiến độ kế hoạch!', 'success');
    },
    onError: (err) => showToast(err.message || 'Không cập nhật được tiến độ.', 'error'),
  });
  const applyPlan = useMutation({
    mutationFn: (id) => api.post(`/study-plans/${id}/apply-to-schedule`, {}),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['study-plans'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['analytics-dashboard'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      showToast(res?.message || 'Đã áp dụng lộ trình vào lịch!', 'success');
    },
    onError: (err) => showToast(err.message || 'Không áp dụng được.', 'error'),
  });
  const autoBalance = useMutation({
    mutationFn: () => api.post('/schedule/auto-balance', {}),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['timeline'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['analytics-dashboard'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      showToast(res?.message || 'Thuật toán AI đã tự động tối ưu lịch trình!', 'success');
    },
    onError: (err) => showToast(err.message || 'Không tối ưu được lịch. Thử lại sau.', 'error'),
  });

  // ---- tuần / heatmap ----
  const days = useMemo(() => weekDays(), []);
  const todayIdx = (new Date().getDay() + 6) % 7;
  const fmtD = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const weekNum = Math.ceil((((days[0] - new Date(days[0].getFullYear(), 0, 1)) / 864e5) + 1) / 7);
  const weekLabel = `Lập kế hoạch tuần thứ ${weekNum} (${fmtD(days[0])} - ${fmtD(days[6])}/${days[6].getFullYear()})`;

  const hours = Array.isArray(dash?.weekly_focus_hours) ? dash.weekly_focus_hours : [0, 0, 0, 0, 0, 0, 0];
  const weekDayNames = Array.isArray(dash?.week_days) ? dash.week_days : ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
  const maxH = Math.max(6, ...hours);

  // ---- metrics ----
  const targetDay = profile?.target_daily_focus_hours || 6;
  const targetWeek = Math.round(targetDay * 7 * 10) / 10;
  const doneWeek = dash?.total_week_hours || 0;
  const pctWeek = targetWeek > 0 ? Math.min(100, Math.round((doneWeek / targetWeek) * 100)) : 0;
  const activeTasks = tasks.filter((t) => t.status !== 'completed');
  const subjNames = [...new Set(activeTasks.map((t) => t.subject_name).filter(Boolean))].slice(0, 3).join(' • ');
  const withDl = activeTasks
    .filter((t) => t.deadline)
    .map((t) => ({ t, dl: new Date(t.deadline) }))
    .filter((x) => !Number.isNaN(x.dl))
    .sort((a, b) => a.dl - b.dl)[0];
  const goldenParts = String(pulse?.golden_hour_range || '').split('&').map((s) => s.trim()).filter(Boolean);

  // ---- day events ----
  const todayStr = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });
  const TYPE_BADGE = { deep_work: 'DEEP WORK', class: 'LỚP HỌC', self_study: 'TỰ HỌC', study_break: 'NGHỈ NGƠI' };

  // ---- eisenhower ----
  const now = new Date();
  const isUrgent = (t) => {
    if (!t.deadline) return false;
    return new Date(t.deadline) - now < 3 * 864e5;
  };
  const eisenGroups = [
    ['KHẨN CẤP & QUAN TRỌNG — Làm ngay', tasks.filter((t) => isUrgent(t) && t.priority === 'high' && t.status !== 'completed'), true],
    ['QUAN TRỌNG, chưa gấp — Lên lịch', tasks.filter((t) => !isUrgent(t) && t.priority === 'high' && t.status !== 'completed'), false],
    ['GẤP nhưng ít quan trọng — Ủy quyền/rút gọn', tasks.filter((t) => isUrgent(t) && t.priority !== 'high' && t.status !== 'completed'), false],
    ['Hoàn thành / ít ưu tiên', tasks.filter((t) => t.status === 'completed' || (!isUrgent(t) && t.priority !== 'high')), false],
  ];

  const todayIso = new Date().toLocaleDateString('en-CA');
  const upcoming = [...events]
    .filter((e) => {
      const hm = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
      return !e.is_completed && (!e.event_date || e.event_date === todayIso) && e.end_time > hm;
    })
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0];

  const hmNow = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;

  return (
    <div className="max-w-[1440px] w-full mx-auto p-4 md:p-6 lg:p-8 space-y-6 pb-24">
      {/* Subheader */}
      <div className="glass-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
            <span className="text-blue-600 text-base">🏫</span>
            <span>{user?.university ? `${user.university}${user.major ? ` • ${user.major}` : ''}` : 'Học kỳ I / Năm 3 • ĐHQG TP.HCM'}</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-800 font-semibold truncate">{weekLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100/70 text-blue-700 text-xs font-semibold tracking-wide border border-blue-200/60">
            <span>🌀</span>
            <span>THUẬT TOÁN TƯƠNG THÍCH NHỊP SINH HỌC CHRONOBIOLOGY V3.2</span>
          </div>
        </div>
        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowLmsModal(true)}
            className="px-3 py-2 rounded-xl bg-white/70 hover:bg-white text-slate-700 text-xs font-medium border border-slate-200/80 transition-all shadow-xs flex items-center gap-1.5 active:scale-95"
          >
            <span>🔄</span>
            <span>Đồng bộ Canvas &amp; Google (1-Click)</span>
          </button>
          <button
            type="button"
            onClick={() => autoBalance.mutate()}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5 hover:brightness-105 active:scale-95"
          >
            <span>✨</span>
            <span>Tự động tối ưu lịch (AI Balance)</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/tasks')}
            className="px-3 py-2 rounded-xl bg-blue-50/80 hover:bg-blue-100/80 text-blue-700 text-xs font-semibold border border-blue-100 transition-all flex items-center gap-1 active:scale-95"
          >
            <span>+</span>
            <span>Thêm môn học / Deadline</span>
          </button>
        </div>
      </div>

      {/* Hero */}
      <section className="glass-card rounded-3xl p-6 lg:p-7 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-3xl space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100/70 text-blue-700 text-xs font-semibold border border-blue-200/50">
                🎛 CHU KỲ ULTRADIAN 90 PHÚT
              </span>
              <span className="text-slate-500 text-xs">• Chu kỳ minh mẫn tự nhiên</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">Lập kế hoạch thông minh theo Nhịp sinh học AI</h1>
            <p className="text-sm text-slate-600 leading-relaxed font-normal">
              AI tự động phân bổ khối lượng bài tập lớn và đồ án vào các khung giờ não bộ đạt trạng thái tỉnh thức cao nhất (
              <span className="text-blue-600 font-semibold">Alpha 10Hz</span>), bảo vệ giấc ngủ phục hồi và kích hoạt giao thức cảnh báo kiệt sức sớm (
              <span className="text-blue-700 font-semibold">Anti-burnout protocol</span>).
            </p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Trang này lo <strong>lộ trình ôn thi + hạn nộp</strong> •
              Chi tiết từng giờ xem <Link to="/schedule" className="text-blue-600 hover:underline font-semibold">Lịch trình</Link> •
              Tạo/sửa bài tập ở <Link to="/tasks" className="text-blue-600 hover:underline font-semibold">Nhiệm vụ</Link>
            </p>
          </div>
          <div className="w-full md:w-auto bg-gradient-to-r from-blue-50/90 to-indigo-50/90 border border-blue-200/80 rounded-2xl p-4 flex items-center justify-between md:justify-start gap-4 shrink-0 shadow-sm">
            <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-white shadow-inner border border-blue-100 text-blue-600 text-xl">
              🌙
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-slate-500 font-medium">Trạng thái năng lượng</span>
              <span className="text-lg font-bold text-blue-700">
                {pulse ? (pulse.is_golden_hour ? `Đang Đỉnh Alpha (${pulse.pulse_percent}%)` : `Năng lượng ${pulse.pulse_percent}%`) : 'Đạt Đỉnh Alpha (94%)'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="planner-metrics">
        <div className="glass-card rounded-2xl p-5 relative overflow-hidden hover:shadow-md transition flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Học sâu tuần này</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100/60">⏱</div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">{doneWeek}h</span>
              <span className="text-xs text-slate-500">/ {targetWeek}h mục tiêu</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div className="bg-blue-600 h-full rounded-full transition-all duration-700" style={{ width: `${pctWeek}%` }} />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="text-blue-600 font-medium">Tiến độ {pctWeek}%</span>
            <span>{doneWeek >= targetWeek ? 'Đã đạt mục tiêu tuần!' : `Còn ${Math.round((targetWeek - doneWeek) * 10) / 10}h cần hoàn thành`}</span>
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 relative overflow-hidden hover:shadow-md transition flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Đỉnh Alpha Não bộ (TỐI ƯU)</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center border border-cyan-100/60">🧠</div>
          </div>
          <div className="flex flex-col">
            {goldenParts.length ? (
              goldenParts.map((p, i) => (
                <span key={i} className={`text-lg font-bold ${i === 0 ? 'text-slate-800' : 'text-blue-600'}`}>
                  {i === 0 ? p : `& ${p}`}
                </span>
              ))
            ) : (
              <>
                <span className="text-lg font-bold text-slate-800">08:30 - 11:30</span>
                <span className="text-lg font-bold text-blue-600">&amp; 14:30 - 16:30</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-cyan-700 font-medium">
            <span>📈</span>
            <span>{pulse ? `Năng lượng hiện tại ${pulse.pulse_percent}%${pulse.is_golden_hour ? ' • Đang giờ vàng' : ''}` : 'Đang tải nhịp sinh học…'}</span>
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 relative overflow-hidden hover:shadow-md transition flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Mức độ kiệt sức</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100/60">👁</div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-600">{String(dash?.burnout_risk || 'Ổn định').split('(')[0].trim() || 'Mức Thấp'}</span>
              <span className="text-xs text-slate-500">
                {dash?.circadian_alignment_score ? `(Đồng bộ ${dash.circadian_alignment_score}%)` : '(Sẵn sàng)'}
              </span>
            </div>
            <span className="text-xs text-slate-500 mt-0.5">
              Streak {dash?.current_streak_days || 0} ngày • {dash?.current_streak_days ? 'Xao nhãng thấp' : 'Bắt đầu tuần mới'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Hiệu suất Zen {dash?.zen_efficiency_index ?? (dash?.current_streak_days ? 0 : 95)}%</span>
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 relative overflow-hidden hover:shadow-md transition flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Đồ án trọng tâm</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100/60">📁</div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-blue-600">{activeTasks.length} Môn</span>
              {activeTasks.length > 0 ? (
                <span className="text-xs text-rose-600 font-semibold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">CẤP THIẾT</span>
              ) : (
                <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">HOÀN TẤT</span>
              )}
            </div>
            <span className="text-xs text-slate-700 truncate mt-0.5">{subjNames || 'Không có bài tập tồn đọng'}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <span>⏰</span>
            <span>
              {withDl
                ? `Deadline gần nhất: ${withDl.t.title.slice(0, 30)} (${Math.max(0, Math.ceil((withDl.dl - new Date()) / 864e5))} ngày tới)`
                : 'Chưa có deadline nào'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          {/* Study Plans (tab + AI generate) */}
          <section className="glass-card rounded-3xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">Kế hoạch học tập AI</h2>
                <p className="text-xs text-slate-500">Tạo thủ công hoặc để AI lên lộ trình theo ngày thi • {plans.length} kế hoạch</p>
              </div>
              <div className="sm:ml-auto flex items-center p-1 rounded-xl bg-slate-100/80 border border-slate-200/60" role="tablist" aria-label="Chế độ kế hoạch">
                {[['plans', 'Kế hoạch của tôi'], ['ai', 'AI tạo kế hoạch']].map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={planTab === v}
                    onClick={() => setPlanTab(v)}
                    className={
                      planTab === v
                        ? 'px-4 py-1.5 rounded-lg bg-white text-blue-600 shadow-xs text-xs font-semibold'
                        : 'px-4 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 text-xs transition-colors'
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {planTab === 'plans' && (
              <div className="mt-4 space-y-4">
                  <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (form.title.trim().length < 2) { showToast('Tên kế hoạch ít nhất 2 ký tự.', 'warning'); return; }
                    createPlan.mutate();
                  }}
                  className="grid sm:grid-cols-[1fr_160px_150px_90px_auto] gap-2 p-3 rounded-2xl bg-slate-50 border"
                >
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Tên kế hoạch (VD: Ôn Giải tích 2)" className="px-3 py-2 rounded-xl border border-slate-200 text-xs" />
                  <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Môn học" className="px-3 py-2 rounded-xl border border-slate-200 text-xs" />
                  <input type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} className="px-3 py-2 rounded-xl border border-slate-200 text-xs" />
                  <input type="number" min={0.5} max={16} step={0.5} value={form.hoursPerDay} onChange={(e) => setForm({ ...form, hoursPerDay: e.target.value })} title="Giờ học mỗi ngày (0.5–16)" className="px-3 py-2 rounded-xl border border-slate-200 text-xs" />
                  <button type="submit" disabled={createPlan.isPending} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold disabled:opacity-60">Tạo</button>
                </form>
                {plansQ.isPending && <p className="text-xs text-slate-500">Đang tải…</p>}
                {plansQ.isError && <p className="text-xs text-amber-600">Backend chưa có Study Plans API — hiển thị nhiệm vụ bên dưới thay thế.</p>}
                {plans.length === 0 && !plansQ.isPending && (
                  <p className="text-xs text-slate-500">Chưa có kế hoạch nào. Tạo mới hoặc dùng AI ở tab bên cạnh.</p>
                )}
                <div className="grid sm:grid-cols-2 gap-3">
                  {plans.map((p) => (
                    <div key={p.id} className="p-4 rounded-2xl bg-white/80 border border-slate-200/70">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800">{p.title}</p>
                          <p className="text-[11px] text-slate-500">
                            {p.subject || '—'}{p.exam_date ? ` • Thi ${p.exam_date}` : ''}{p.hours_per_day ? ` • ${p.hours_per_day}h/ngày` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label="Xóa kế hoạch"
                          onClick={() => { if (window.confirm('Xóa kế hoạch này?')) deletePlan.mutate(p.id); }}
                          className="text-slate-300 hover:text-rose-600 text-sm px-1"
                        >
                          ✕
                        </button>
                      </div>
                      {p.progress != null && (
                        <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden" title={`Tiến độ: ${Math.round(p.progress)}%`}>
                          {/* FIX: backend trả progress 0-100 (không phải 0-1) — nhân 100 làm thanh luôn đầy */}
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, Math.max(0, Math.round(p.progress)))}%` }} />
                        </div>
                      )}
                      {p.summary && <p className="mt-2 text-xs text-slate-500 leading-relaxed">{p.summary}</p>}
                      {Array.isArray(p.phases) && p.phases.length > 0 && (
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer text-blue-600 font-semibold">
                            Lộ trình {p.phases.length} ngày — xem chi tiết
                          </summary>
                          <ul className="mt-1.5 space-y-1 max-h-40 overflow-y-auto pr-1">
                            {p.phases.slice(0, 14).map((ph, i) => (
                              <li key={i} className="flex items-center gap-2 text-slate-600">
                                <span className="shrink-0 font-mono text-[10px] text-slate-400">{ph.date?.slice(5) || `N${i + 1}`}</span>
                                <span className="truncate">{ph.focus || ph.stage}</span>
                                <span className="ml-auto shrink-0 text-[10px] text-slate-400">{ph.minutes}p</span>
                              </li>
                            ))}
                            {p.phases.length > 14 && <li className="text-slate-400 text-[11px]">…và {p.phases.length - 14} ngày nữa</li>}
                          </ul>
                        </details>
                      )}
                      <div className="mt-2 flex gap-2">
                        {Array.isArray(p.phases) && p.phases.length > 0 && (
                          <button
                            type="button"
                            onClick={() => applyPlan.mutate(p.id)}
                            disabled={applyPlan.isPending}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-[11px] font-semibold transition"
                          >
                            Áp dụng vào lịch
                          </button>
                        )}
                        {/* Cập nhật tiến độ — inline (không dùng window.prompt) */}
                        {progressEditing[p.id] !== undefined ? (
                          <form
                            className="flex items-center gap-1"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const val = Number(progressEditing[p.id]);
                              if (!Number.isFinite(val) || val < 0 || val > 100) {
                                showToast('Tiến độ phải là số từ 0 đến 100.', 'warning');
                                return;
                              }
                              updatePlanProgress.mutate({ id: p.id, progress: val });
                              setProgressEditing((prev) => { const n = { ...prev }; delete n[p.id]; return n; });
                            }}
                          >
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={progressEditing[p.id]}
                              onChange={(e) => setProgressEditing((prev) => ({ ...prev, [p.id]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === 'Escape') setProgressEditing((prev) => { const n = { ...prev }; delete n[p.id]; return n; }); }}
                              autoFocus
                              className="w-16 px-2 py-1 rounded-lg border border-blue-300 text-xs text-center"
                            />
                            <span className="text-xs text-slate-400">%</span>
                            <button type="submit" disabled={updatePlanProgress.isPending} className="px-2 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-semibold">✓</button>
                            <button type="button" onClick={() => setProgressEditing((prev) => { const n = { ...prev }; delete n[p.id]; return n; })} className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px]">✕</button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setProgressEditing((prev) => ({ ...prev, [p.id]: String(Math.round(p.progress || 0)) }))}
                            disabled={updatePlanProgress.isPending}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[11px] font-semibold transition"
                          >
                            Cập nhật tiến độ
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {planTab === 'ai' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!genForm.subject.trim()) { showToast('Nhập môn học cần ôn.', 'warning'); return; }
                  generatePlan.mutate();
                }}
                className="mt-4 grid sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100"
              >
                <label className="text-xs text-slate-600 font-semibold">
                  Môn học
                  <input value={genForm.subject} onChange={(e) => setGenForm({ ...genForm, subject: e.target.value })} placeholder="VD: Xác suất thống kê" className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-normal" />
                </label>
                <label className="text-xs text-slate-600 font-semibold">
                  Ngày thi
                  <input type="date" value={genForm.examDate} onChange={(e) => setGenForm({ ...genForm, examDate: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-normal" />
                </label>
                <label className="text-xs text-slate-600 font-semibold">
                  Giờ học mỗi ngày
                  <input type="number" min={0.5} max={16} step={0.5} value={genForm.hoursPerDay} onChange={(e) => setGenForm({ ...genForm, hoursPerDay: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-normal" />
                </label>
                <label className="text-xs text-slate-600 font-semibold">
                  Mức độ
                  <select value={genForm.level} onChange={(e) => setGenForm({ ...genForm, level: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-normal">
                    <option value="easy">Nhẹ nhàng</option>
                    <option value="medium">Vừa sức</option>
                    <option value="intense">Cấp tốc</option>
                  </select>
                </label>
                <button type="submit" disabled={generatePlan.isPending} className="sm:col-span-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold transition">
                  {generatePlan.isPending ? 'AI đang lên lộ trình…' : '✨ Tạo kế hoạch bằng AI'}
                </button>
              </form>
            )}
          </section>

          {/* Timeline */}
          <section className="glass-card rounded-3xl p-6 relative">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-blue-50 text-blue-600 text-lg">🗓</span>
                <div>
                  <h2 className="text-base font-bold text-slate-800">Dòng thời gian Tuần &amp; Nhịp Sinh học</h2>
                  <p className="text-xs text-slate-500">Điều hướng năng lượng theo nhịp sinh học tự nhiên Ultradian 90 phút</p>
                </div>
              </div>
              <div className="flex items-center p-1 rounded-xl bg-slate-100/80 border border-slate-200/60 self-start sm:self-auto" role="tablist" aria-label="Chế độ xem kế hoạch">
                {[['week', 'Tuần này'], ['day', 'Xem theo ngày'], ['eisenhower', 'Ma trận Eisenhower AI']].map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={view === v}
                    onClick={() => setView(v)}
                    className={
                      view === v
                        ? 'px-3 py-1.5 rounded-lg bg-white text-blue-600 shadow-xs text-xs font-semibold'
                        : 'px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 text-xs transition-colors'
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-blue-50/50 border border-blue-100/50 mt-4 text-xs text-slate-600">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-600" /> Deep Work (Alpha 10Hz)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-cyan-400" /> Calm Break (Hồi phục)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-600" /> Focus Sprint (Tư duy)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-300" /> Light Study (Đọc &amp; Ôn)</span>
            </div>

            {(view === 'week') && (
              <>
                <div className="overflow-x-auto -mx-1 px-1 pb-1">
                  <div className="grid grid-cols-7 gap-2 pt-4 min-w-[560px]">
                    {hours.map((h, i) => {
                      const d = days[i];
                      const isToday = i === todayIdx;
                      const pct = Math.round((h / maxH) * 100);
                      return (
                        <div key={i} className={`flex flex-col items-center p-2.5 rounded-2xl text-center transition-all relative ${isToday ? 'bg-blue-50/90 border-2 border-blue-500 shadow-xs' : 'bg-white/70 border border-slate-100 hover:bg-white'}`}>
                          {isToday && <span className="absolute -top-2.5 px-2 py-0.5 rounded-full bg-blue-600 text-white text-[9px] font-bold uppercase tracking-wider">Hôm nay</span>}
                          <span className={`text-xs ${isToday ? 'text-blue-700 font-bold' : 'text-slate-500'}`}>{weekDayNames[i] || ''}</span>
                          <span className="text-base font-semibold text-slate-800 mt-1">{d.getDate()}</span>
                          <span className="text-xs text-blue-600 font-medium mt-1">{h}h</span>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                            <div className="bg-blue-600 h-full rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-3 mt-6 pt-4 border-t border-slate-100">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-800">Hôm nay: {todayStr}</h3>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-100/70 text-blue-700 text-xs font-bold border border-blue-200/60">
                        {pulse ? `${pulse.pulse_percent}% SẴN SÀNG TƯ DUY` : '...'}
                      </span>
                    </div>
                    <Link to="/schedule" className="text-xs text-blue-600 hover:underline font-semibold">Mở Lịch trình chi tiết →</Link>
                  </div>
                  {timelineQ.isPending && <p className="text-xs text-slate-500">Đang tải lịch hôm nay...</p>}
                  {!timelineQ.isPending && events.length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-500">Chưa có sự kiện nào. Sang Lịch trình để AI xếp phiên học vào khung giờ vàng.</div>
                  )}
                  {events.slice(0, 3).map((ev) => (
                    <div key={ev.id} className={`flex items-center gap-3 p-3 rounded-2xl border ${ev.is_completed ? 'bg-white/70 border-slate-100' : 'bg-white/90 border-slate-200/70'}`}>
                      <span className="text-xs font-bold text-slate-800 shrink-0 w-24">{ev.start_time} - {ev.end_time}</span>
                      <span className={`text-xs font-semibold truncate ${ev.is_completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>{ev.title}</span>
                      <span className={`ml-auto text-[10px] font-bold shrink-0 ${ev.is_completed ? 'text-emerald-600' : 'text-blue-600'}`}>{ev.is_completed ? '✓' : '•'}</span>
                    </div>
                  ))}
                  {events.length > 3 && (
                    <Link to="/schedule" className="text-center text-xs font-semibold text-blue-600 hover:underline">+ {events.length - 3} sự kiện nữa trong Lịch trình →</Link>
                  )}
                </div>
              </>
            )}

            {view === 'day' && (
              <div className="flex flex-col gap-3 mt-6 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800">Lịch trình chi tiết hôm nay: {todayStr} ({events.length} sự kiện)</h3>
                  <Link to="/schedule" className="text-xs text-blue-600 hover:underline font-semibold">Xem + tick trong Lịch trình →</Link>
                </div>
                {events.length === 0 && <p className="text-xs text-slate-500">Chưa có sự kiện nào hôm nay.</p>}
                {events.slice(0, 4).map((ev) => (
                  <div key={ev.id} className="flex items-center gap-3 p-3 rounded-2xl bg-white/90 border border-slate-200/70">
                    <span className="text-xs font-bold text-slate-800 shrink-0 w-24">{ev.start_time} - {ev.end_time}</span>
                    <span className={`text-xs font-semibold truncate ${ev.is_completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>{ev.title}</span>
                  </div>
                ))}
                {events.length > 4 && <p className="text-[11px] text-slate-400 text-center">…và {events.length - 4} sự kiện khác (xem trong Lịch trình)</p>}
              </div>
            )}

            {view === 'eisenhower' && (
              <div className="mt-4">
                <p className="text-xs text-slate-500 mb-3">Kanban Ma trận Eisenhower AI — khẩn cấp = hạn ≤ 3 ngày, quan trọng = ưu tiên cao.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {eisenGroups.map(([label, list, hot], i) => (
                    <div key={i} className={`p-3.5 rounded-2xl border ${hot ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200 bg-white/70'}`}>
                      <p className={`text-xs font-bold mb-2 ${hot ? 'text-rose-700' : 'text-slate-700'}`}>Q{i + 1}: {label} ({list.length})</p>
                      <div className="space-y-1.5">
                        {list.length ? list.map((t) => (
                          <div key={t.id} className="text-xs p-2 rounded-xl bg-white border border-slate-100 font-medium text-slate-700 truncate">{t.title}</div>
                        )) : <p className="text-[11px] text-slate-400">Trống</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Task sprints */}
          {view !== 'day' && (
            <section className="glass-card rounded-3xl p-6 relative">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 text-lg">🌳</span>
                  <div>
                    <h2 className="text-base font-bold text-slate-800">Kế hoạch Chia nhỏ Đồ án Lớn (AI Task Sprints)</h2>
                    <p className="text-xs text-slate-500">Thuật toán phân rã nhiệm vụ phức tạp thành các chặng sprint nhỏ 25-45 phút</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/tasks')}
                  className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100/80 border border-blue-100 text-xs font-semibold flex items-center gap-1.5 transition-all self-start sm:self-auto"
                >
                  <span>✨</span>
                  <span>AI Phân rã Đồ án mới</span>
                </button>
              </div>
              <div className="space-y-4 mt-4">
                {tasksQ.isPending && <p className="text-xs text-slate-500">Đang tải đồ án...</p>}
                {!tasksQ.isPending && tasks.length === 0 && (
                  <div className="p-4 rounded-2xl bg-white/70 border border-slate-200/70 text-center space-y-1.5">
                    <p className="text-xs font-bold text-slate-800">Chưa có đồ án nào.</p>
                    <p className="text-[11px] text-slate-500">Bấm &quot;AI Phân rã Đồ án mới&quot; để bắt đầu.</p>
                  </div>
                )}
                {tasks.slice(0, 5).map((task) => {
                  const total = task.total_sprints || 1;
                  const done = task.completed_sprints || 0;
                  const pct = Math.round((done / total) * 100);
                  return (
                    <div key={task.id} className="p-4 rounded-2xl bg-white/70 border border-slate-200/70 hover:shadow-xs transition flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2.5 py-0.5 rounded-md bg-blue-600 text-white text-xs font-bold">
                            {String(task.subject_name || 'Môn học').substring(0, 6).toUpperCase()}
                          </span>
                          <span className="text-sm font-bold text-slate-800 truncate">{task.title}</span>
                          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-semibold">
                            {task.status === 'completed' ? 'Đã hoàn thành' : 'Đang thực hiện'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-slate-500">Tiến độ {pct}%</span>
                          <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div className="bg-blue-600 h-full rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                        {(task.subtasks || []).slice(0, 4).map((st) => (
                          st.is_completed ? (
                            <div key={st.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/80 border border-slate-100 text-slate-400">
                              <span className="w-4 h-4 rounded bg-emerald-500 text-white flex items-center justify-center shrink-0 text-[10px] font-bold">✓</span>
                              <span className="text-xs line-through truncate">{st.title}</span>
                            </div>
                          ) : (
                            <div key={st.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-4 h-4 rounded border border-slate-300 shrink-0" />
                                <span className="text-xs font-medium text-slate-800 truncate">{st.title}</span>
                              </div>
                              <span className="px-2 py-0.5 rounded bg-blue-100/70 text-blue-700 text-[11px] font-semibold shrink-0">{st.estimated_minutes || 25}p</span>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          <section className="glass-card rounded-3xl p-5 space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-100 text-blue-600">📊</span>
                <h3 className="text-sm font-bold text-slate-800">Nhịp sinh học Não bộ</h3>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-100/80 text-blue-700 text-[10px] font-bold uppercase tracking-wider border border-blue-200/60">
                TRẠNG THÁI ALPHA
              </span>
            </div>
            <div className="w-full bg-blue-50/50 rounded-2xl p-3.5 border border-blue-100/60 flex flex-col gap-2 relative">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>06:00 Sáng</span>
                <span className="text-blue-600 font-bold">{hmNow} (Hiện tại: {pulse?.pulse_percent ?? 94}%)</span>
                <span>23:00 Đêm</span>
              </div>
              <div className="w-full h-28 relative flex items-center justify-center">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 320 120">
                  <defs>
                    <linearGradient id="waveGradientPlanner" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity="0.30" />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <path d="M 0,90 Q 40,20 80,30 T 160,85 T 230,25 T 320,105 L 320,120 L 0,120 Z" fill="url(#waveGradientPlanner)" />
                  <path d="M 0,90 Q 40,20 80,30 T 160,85 T 230,25 T 320,105" fill="none" stroke="#2563eb" strokeLinecap="round" strokeWidth="3" />
                  <circle cx="80" cy="30" fill="#006398" r="4" />
                  <circle className="animate-ping opacity-40" cx="230" cy="25" fill="#2563eb" r="7" />
                  <circle cx="230" cy="25" fill="#2563eb" r="5" stroke="#ffffff" strokeWidth="2" />
                  <circle cx="160" cy="85" fill="#94a3b8" r="4" />
                </svg>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Khởi động</span>
                <span className="text-cyan-700 font-medium">Đỉnh 1 (10:00)</span>
                <span>Hồi phục</span>
                <span className="text-blue-600 font-bold">Đỉnh 2 (15:00)</span>
                <span>Thư giãn</span>
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-100 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-blue-700 text-xs font-bold">
                <span>🧠</span>
                <span>LỜI KHUYÊN CỦA STUĐIÔ AI</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {pulse
                  ? `"${pulse.recommendation}"${activeTasks[0] ? ` Ưu tiên hiện tại: ${activeTasks[0].title}.` : ''}`
                  : 'Đang phân tích nhịp sinh học của bạn...'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/deepwork?duration=50&sound=ocean')}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95"
            >
              <span>🎯</span>
              <span>Kích hoạt Chế độ Tập trung Sâu (Deep Mode)</span>
            </button>
          </section>

          <section className="glass-card rounded-3xl p-5 space-y-3.5 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600">📅</span>
                <h3 className="text-sm font-bold text-slate-800">Hạn nộp &amp; Kỳ thi Cận kề</h3>
              </div>
              <span className="text-xs text-slate-500 font-medium">{tasks.length} Đồ án</span>
            </div>
            <div className="space-y-2.5">
              {tasks.length === 0 && (
                <div className="p-3 rounded-2xl bg-white/70 border border-slate-100 text-center text-[11px] text-slate-500">Chưa có hạn nộp nào.</div>
              )}
              {tasks.slice(0, 4).map((task) => (
                <div key={task.id} className="p-3 rounded-2xl bg-white/70 border border-slate-100 hover:bg-white transition-all flex items-center justify-between gap-2 shadow-2xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold uppercase leading-none">P{task.completed_sprints ?? 0}</span>
                      <span className="text-xs font-bold leading-none mt-0.5">{task.total_sprints ?? 1}p</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-slate-800 truncate">{task.title}</span>
                      <span className="text-[11px] text-slate-500 truncate">
                        {task.subject_name || 'Môn học'}{task.subject_code ? ` (${task.subject_code})` : ''} • Ưu tiên {task.priority || 'cao'}
                      </span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold shrink-0 border border-blue-100">
                    {task.status === 'completed' ? 'Xong' : 'Đang làm'}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-card rounded-3xl p-5 space-y-3.5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-100 text-blue-600">🌊</span>
                <h3 className="text-sm font-bold text-slate-800">Âm thanh Tĩnh lặng 432Hz</h3>
              </div>
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${isPlaying ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-100 border-slate-200'}`}>
                {isPlaying ? 'ĐANG PHÁT' : 'TẠM DỪNG'}
              </span>
            </div>
            <div className="relative w-full h-36 rounded-2xl overflow-hidden shadow-xs group">
              <img alt="Lighthouse Ocean Sunset" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" src="/assets/images/lighthouse-wide.png" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/30 to-transparent flex flex-col justify-end p-3">
                <span className="text-blue-100 text-[11px] font-medium">Tần số cộng hưởng Solfeggio</span>
                <h4 className="text-white text-sm font-bold leading-tight">{track.title}</h4>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-2xl bg-blue-50/50 border border-blue-100/60">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Tạm dừng hoặc phát"
                  onClick={togglePlay}
                  className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs hover:bg-blue-700 transition-all"
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-800">Biển Vũng Tàu • Chiều tà</span>
                  <span className="text-[11px] text-slate-500">Thư giãn sâu não bộ</span>
                </div>
              </div>
              <div className="flex items-end gap-1 h-5 px-1">
                <span className="w-1 h-2 bg-blue-600 rounded-full animate-pulse" />
                <span className="w-1 h-4 bg-blue-600 rounded-full animate-pulse" />
                <span className="w-1 h-2 bg-blue-600 rounded-full animate-pulse" />
                <span className="w-1 h-3.5 bg-blue-600 rounded-full animate-pulse" />
              </div>
            </div>
            <div className="flex items-center justify-between px-1 text-xs text-slate-500">
              <button
                type="button"
                onClick={cycleSleep}
                className="hover:text-blue-600 transition font-medium"
              >
                Hẹn giờ tắt: {sleepMinutes > 0 ? `${sleepMinutes} phút` : 'Tắt'} (Bấm để đổi)
              </button>
              <Link className="text-blue-600 font-medium hover:underline text-xs" to="/sound">Chọn âm thanh khác →</Link>
            </div>
          </section>
        </div>
      </div>

      {/* Next session bar */}
      <div className="glass-card bg-white/95 rounded-2xl p-3 px-5 border border-white/90 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-100/80 flex items-center justify-center text-blue-600 shrink-0">⏳</div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-900 truncate">
                {upcoming ? `Phiên học tiếp theo: ${upcoming.title}` : 'Hôm nay đã hoàn thành hết phiên học. Tuyệt vời!'}
              </span>
              {upcoming && <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{upcoming.start_time} - {upcoming.end_time}</span>}
            </div>
            <p className="text-[11px] text-slate-500 truncate">{upcoming?.description || 'Âm thanh kích hoạt sóng não: Tiếng mưa rơi tĩnh lặng & Nhịp điệu Lo-Fi biển'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link to="/sound" className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 transition">
            ⚙️ Cài đặt âm thanh
          </Link>
          <button
            type="button"
            onClick={() => navigate('/deepwork')}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition flex items-center gap-1"
          >
            <span>Bắt đầu Pomodoro</span>
            <span>🍅</span>
          </button>
        </div>
      </div>

      <LmsSyncModal isOpen={showLmsModal} onClose={() => setShowLmsModal(false)} />
    </div>
  );
}
