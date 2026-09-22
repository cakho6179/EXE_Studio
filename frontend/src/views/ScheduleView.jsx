import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext.jsx';
import { useAudio } from '../contexts/AudioContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { api } from '../services/api.js';
import { useTasks, useTimeline } from '../hooks/useApi.js';
import LmsSyncModal from '../components/LmsSyncModal.jsx';

const SLOTS = [
  { label: '07:30', from: '07:30', to: '09:00' },
  { label: '09:00', sub: 'Alpha 1', from: '09:00', to: '11:30' },
  { label: '11:30', from: '11:30', to: '13:30', band: 'CALM BREAK & PHỤC HỒI: ăn trưa, chợp mắt 20p' },
  { label: '14:00', sub: 'Alpha 2', from: '14:00', to: '16:30' },
  { label: '17:00', from: '17:00', to: '19:30' },
  { label: '19:30', from: '19:30', to: '21:30' },
];

const TYPE_STYLE = {
  deep_work: 'bg-blue-600 text-white font-semibold shadow-2xs',
  class: 'bg-cyan-50 text-cyan-700 font-semibold border border-cyan-100',
  self_study: 'bg-indigo-50 text-indigo-700 font-medium border border-indigo-100',
  study_break: 'bg-amber-50 text-amber-800 font-medium border border-amber-100',
};
const TYPE_LABEL = { deep_work: 'DEEP WORK', class: 'LỚP HỌC', self_study: 'TỰ HỌC', study_break: 'NGHỈ NGƠI' };

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayIso = () => isoOf(new Date());
function weekDays(offsetWeeks = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offsetWeeks * 7);
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export default function ScheduleView() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { isPlaying, track, togglePlay, sleepMinutes, setSleepTimer } = useAudio();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [view, setView] = useState('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(todayIso());
  const [showAdd, setShowAdd] = useState(false);
  const [showLmsModal, setShowLmsModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    task_id: '',
    date: todayIso(),
    start: '14:00',
    end: '15:30',
    type: 'deep_work',
  });
  const openEdit = (ev) => {
    setEditingId(ev.id);
    setForm({
      title: ev.title || '',
      description: ev.description || '',
      task_id: ev.task_id || '',
      date: ev.event_date || todayIso(),
      start: (ev.start_time || '14:00').slice(0, 5),
      end: (ev.end_time || '15:30').slice(0, 5),
      type: ev.event_type || 'deep_work',
    });
    setShowAdd(true);
  };
  const closeForm = () => { setShowAdd(false); setEditingId(null); };

  const cycleSleep = () => {
    const steps = [0, 15, 30, 45, 60];
    const curIdx = steps.indexOf(sleepMinutes);
    const next = steps[(curIdx + 1) % steps.length];
    setSleepTimer(next);
    showToast(next > 0 ? `Hẹn giờ tắt sau ${next} phút.` : 'Đã tắt hẹn giờ âm thanh.', 'info');
  };

  const timelineQ = useTimeline();
  const events = useMemo(() => (Array.isArray(timelineQ.data) ? timelineQ.data : []), [timelineQ.data]);
  const tasksQ = useTasks();
  const tasks = useMemo(() => (Array.isArray(tasksQ.data) ? tasksQ.data : []), [tasksQ.data]);

  const sessionsQ = useQuery({
    queryKey: ['focus-sessions'],
    queryFn: () => api.get('/focus/sessions?days=7'),
    enabled: view === 'ultradian',
  });
  const sessions = Array.isArray(sessionsQ.data) ? sessionsQ.data : [];

  const dashQ = useQuery({ queryKey: ['analytics-dashboard'], queryFn: () => api.get('/analytics/dashboard').catch(() => null) });
  const dash = dashQ.data;
  const pulseQ = useQuery({ queryKey: ['pulse'], queryFn: () => api.get('/circadian/pulse').catch(() => null), staleTime: 5 * 60 * 1000 });
  const pulse = pulseQ.data;
  const profileQ = useQuery({ queryKey: ['profile'], queryFn: () => api.get('/auth/profile').catch(() => null), staleTime: 5 * 60 * 1000 });
  const profile = profileQ.data;

  const toggleEvent = useMutation({
    mutationFn: (id) => api.patch(`/schedule/events/${id}/toggle`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeline'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err) => showToast(err.message || 'Không cập nhật được.', 'error'),
  });
  const deleteEvent = useMutation({
    mutationFn: (id) => api.delete(`/schedule/events/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeline'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      showToast('Đã xóa sự kiện thời khóa biểu.', 'success');
    },
    onError: (err) => showToast(err.message || 'Lỗi.', 'error'),
  });
  const saveEvent = useMutation({
    mutationFn: () => {
      const payload = {
        title: form.title.trim(),
        description: form.description?.trim() || null,
        task_id: form.task_id || null,
        event_date: form.date,
        start_time: form.start,
        end_time: form.end,
        event_type: form.type,
        is_circadian_optimized: true,
      };
      // FIX: trước đây UI chỉ tạo mới — sai giờ phải xóa làm lại dù backend
      // có sẵn PATCH /schedule/events/{id} để sửa
      return editingId
        ? api.patch(`/schedule/events/${editingId}`, payload)
        : api.post('/schedule/events', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeline'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      closeForm();
      setForm({ title: '', description: '', task_id: '', date: todayIso(), start: '14:00', end: '15:30', type: 'deep_work' });
      showToast(editingId ? 'Đã sửa sự kiện!' : 'Đã thêm phiên học!', 'success');
    },
    onError: (err) => showToast(err.message || 'Không lưu được.', 'error'),
  });
  const autoBalance = useMutation({
    mutationFn: () => api.post('/schedule/auto-balance', {}),
    onSuccess: (res) => {
      ['timeline', 'tasks', 'focus-sessions', 'analytics-dashboard', 'analytics', 'pulse', 'notifications'].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      );
      showToast(res?.message || 'Thuật toán AI đã tự động tối ưu lịch trình!', 'success');
    },
    onError: (err) => showToast(err.message || 'Không tối ưu được lịch. Thử lại sau.', 'error'),
  });

  const [markingDone, setMarkingDone] = useState(false);

  const days = useMemo(() => weekDays(weekOffset), [weekOffset]);
  const dayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const today = todayIso();
  const evDay = (ev) => ev.event_date || today;
  const fmtD = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const weekNum = Math.ceil((((days[0] - new Date(days[0].getFullYear(), 0, 1)) / 864e5) + 1) / 7);

  const nowHM = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  const live = events.find((e) => evDay(e) === today && e.start_time <= nowHM && nowHM < e.end_time && !e.is_completed);
  const dayEvents = events.filter((e) => evDay(e) === (selectedDay || today)).sort((a, b) => a.start_time.localeCompare(b.start_time));
  // Ưu tiên sự kiện HÔM NAY chưa hết giờ; hết thì lấy sự kiện tương lai gần nhất (trước đây lẫn ngày khác vào)
  const upcomingToday = [...events].filter((e) => !e.is_completed && evDay(e) === today && e.end_time > nowHM).sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
  const upcomingNext = [...events].filter((e) => !e.is_completed && evDay(e) > today).sort((a, b) => `${evDay(a)}${a.start_time}`.localeCompare(`${evDay(b)}${b.start_time}`))[0];
  const upcoming = upcomingToday || upcomingNext;

  const handleMarkDone = async () => {
    const targetEvent = live || upcoming;
    setMarkingDone(true);
    try {
      if (targetEvent?.id) {
        await api.patch(`/schedule/events/${targetEvent.id}/toggle`);
      }
      await api.post('/focus/session/complete', {
        task_id: targetEvent?.task_id || null,
        planned_minutes: 25,
        actual_minutes: 25,
        ambient_sound_used: 'Sóng Biển 432Hz',
        notes: targetEvent?.title ? `Hoàn thành từ Lịch trình: ${targetEvent.title}` : 'Phiên tập trung Lịch trình',
      });
      qc.invalidateQueries({ queryKey: ['timeline'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['focus-sessions'] });
      qc.invalidateQueries({ queryKey: ['analytics-dashboard'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      qc.invalidateQueries({ queryKey: ['pulse'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      showToast(
        targetEvent?.title
          ? `✓ Đã hoàn tất phiên "${targetEvent.title}"!`
          : '✓ Đã ghi nhận hoàn thành phiên tập trung!',
        'success'
      );
    } catch (err) {
      showToast(err.message || 'Không thể cập nhật.', 'error');
    } finally {
      setMarkingDone(false);
    }
  };

  const totalMin = sessions.reduce((a, s) => a + (s.actual_minutes || 0), 0);
  const cycles = Math.floor(totalMin / 90);

  // metrics
  const targetDay = profile?.target_daily_focus_hours || 6;
  const targetWeek = Math.round(targetDay * 7 * 10) / 10;
  const doneWeek = dash?.total_week_hours || 0;
  const pctWeek = targetWeek > 0 ? Math.min(100, Math.round((doneWeek / targetWeek) * 100)) : 0;
  const goldenParts = String(pulse?.golden_hour_range || '').split('&').map((s) => s.trim()).filter(Boolean);
  const pending = events.filter((e) => !e.is_completed);
  const topTask = tasks.filter((t) => t.status !== 'completed')[0];

  return (
    <div className="max-w-[1440px] w-full mx-auto p-4 md:p-6 lg:p-8 space-y-6 pb-24">
      {/* Subheader */}
      <div className="glass-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
            <span className="text-blue-600 text-base">🏫</span>
            <span>{user?.university ? `${user.university}${user.major ? ` • ${user.major}` : ''}` : 'Học kỳ I / Năm 3 • ĐHQG TP.HCM'}</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-800 font-semibold truncate">Lịch trình Sinh học thông minh Tuần {weekNum} ({fmtD(days[0])} - {fmtD(days[6])}/{days[6].getFullYear()})</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100/70 text-blue-700 text-xs font-semibold tracking-wide border border-blue-200/60">
            <span>🌀</span>
            <span>CHRONOBIOLOGY AI ENGINE V3.2</span>
          </div>
        </div>
        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowLmsModal(true)}
            className="px-3 py-2 rounded-xl bg-white/70 hover:bg-white text-slate-700 text-xs font-medium border border-slate-200/80 transition-all shadow-xs flex items-center gap-1.5 active:scale-95"
          >
            <span>🔄</span>
            <span>Đồng bộ Canvas &amp; Google Calendar (1-Click)</span>
          </button>
          <button
            type="button"
            onClick={() => autoBalance.mutate()}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5 hover:brightness-105 active:scale-95"
          >
            <span>✨</span>
            <span>AI Tối ưu Circadian Peak</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="px-3 py-2 rounded-xl bg-blue-50/80 hover:bg-blue-100/80 text-blue-700 text-xs font-semibold border border-blue-100 transition-all flex items-center gap-1 active:scale-95"
          >
            <span>+</span>
            <span>+ Thêm phiên học / Buổi thi</span>
          </button>
        </div>
      </div>

      {/* Hero */}
      <section className="glass-card rounded-3xl p-6 lg:p-7 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-3xl space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100/70 text-blue-700 text-xs font-semibold border border-blue-200/50">
                🎛 CHU KỲ SINH HỌC ULTRADIAN 90 PHÚT
              </span>
              <span className="text-slate-500 text-xs">• Khung giờ sóng não Alpha 10Hz tối ưu</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">Lịch trình Sinh học Thông minh AI</h1>
            <p className="text-sm text-slate-600 leading-relaxed font-normal">
              Hệ thống sắp xếp thời khóa biểu dựa trên chu kỳ tỉnh thức tự nhiên, điều phối bài học khó vào đỉnh sóng{' '}
              <span className="text-blue-600 font-semibold">Alpha 10Hz</span>, sắp đặt các khoảng nghỉ giải tỏa Cortisol (
              <span className="text-cyan-600 font-semibold">Calm Break</span>) và giao thức chống quá tải (
              <span className="text-blue-700 font-semibold">Anti-burnout protocol</span>).
            </p>
          </div>
          <div className="w-full md:w-auto bg-gradient-to-r from-blue-50/90 to-indigo-50/90 border border-blue-200/80 rounded-2xl p-4 flex items-center justify-between md:justify-start gap-4 shrink-0 shadow-sm">
            <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-white shadow-inner border border-blue-100 text-blue-600 text-xl">
              🗓
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-slate-500 font-medium">Khung giờ vàng hiện tại</span>
              <span className="text-lg font-bold text-blue-700">
                {nowHM} • {pulse ? `Đỉnh Alpha (${pulse.pulse_percent}%)` : 'Đỉnh Alpha (94%)'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="sched-metrics">
        <div className="glass-card rounded-2xl p-5 relative overflow-hidden hover:shadow-md transition flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Thời lượng học tuần</span>
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
            <span>{doneWeek >= targetWeek ? 'Đã đạt mục tiêu!' : `Còn ${Math.round((targetWeek - doneWeek) * 10) / 10}h tuần này`}</span>
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 relative overflow-hidden hover:shadow-md transition flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Khung giờ vàng Alpha</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center border border-cyan-100/60">🧠</div>
          </div>
          <div className="flex flex-col">
            {goldenParts.length ? (
              goldenParts.map((p, i) => (
                <span key={i} className={`text-lg font-bold ${i === 0 ? 'text-slate-800' : 'text-blue-600'}`}>{i === 0 ? p : `& ${p}`}</span>
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
            <span>{pulse ? `Năng lượng hiện tại ${pulse.pulse_percent}%` : 'Đang tải nhịp sinh học…'}</span>
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 relative overflow-hidden hover:shadow-md transition flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Phục hồi &amp; Giấc ngủ</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100/60">🌙</div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-600">{(dash?.total_week_hours && dash?.circadian_alignment_score) ? dash.circadian_alignment_score : 92}%</span>
              <span className="text-xs text-slate-500">Chỉ số Tối ưu</span>
            </div>
            <span className="text-xs text-slate-500 mt-0.5">Streak {dash?.current_streak_days || 0} ngày • Zen {dash?.zen_efficiency_index ?? (dash?.current_streak_days ? 0 : 95)}%</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{dash?.burnout_risk || 'Giao thức Anti-burnout an toàn'}</span>
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 relative overflow-hidden hover:shadow-md transition flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sự kiện &amp; Hạn chót</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100/60">🔔</div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-rose-600">{pending.length} Sự kiện</span>
              {pending.length > 0 ? (
                <span className="text-xs text-rose-600 font-semibold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">ƯU TIÊN</span>
              ) : (
                <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">HOÀN TẤT</span>
              )}
            </div>
            <span className="text-xs text-slate-700 truncate mt-0.5">
              {[...new Set(pending.map((e) => (e.title || '').split(':').pop().trim().split(' ').slice(0, 2).join(' ')))].slice(0, 3).join(' • ') || 'Đã xong hết!'}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <span>⏰</span>
            <span>{pending.sort((a, b) => (`${a.event_date}${a.start_time}`).localeCompare(`${b.event_date}${b.start_time}`))[0]
              ? `Sắp tới: ${pending[0].title.slice(0, 32)} (${pending[0].start_time})`
              : 'Không còn sự kiện nào'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          <section className="glass-card rounded-3xl p-6 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-blue-50 text-blue-600 text-lg">📅</span>
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    Lịch sinh học Tuần {weekNum} ({fmtD(days[0])} - {fmtD(days[6])}/{days[6].getFullYear()})
                    {live && <span className="ml-2 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold uppercase animate-pulse">🔴 {live.title.slice(0, 30)}</span>}
                  </h2>
                  <p className="text-xs text-slate-500">Phân bổ bài học theo mức nhịp năng lượng não bộ</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <button
                      type="button"
                      title="Tuần trước"
                      onClick={() => setWeekOffset((o) => o - 1)}
                      className="px-2.5 py-0.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-600 transition cursor-pointer"
                    >
                      ← Tuần trước
                    </button>
                    {weekOffset !== 0 && (
                      <button
                        type="button"
                        onClick={() => setWeekOffset(0)}
                        className="px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-semibold border border-blue-200 transition cursor-pointer"
                      >
                        Tuần này
                      </button>
                    )}
                    <button
                      type="button"
                      title="Tuần sau"
                      onClick={() => setWeekOffset((o) => o + 1)}
                      className="px-2.5 py-0.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-medium text-slate-600 transition cursor-pointer"
                    >
                      Tuần sau →
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center p-1 rounded-xl bg-slate-100/80 border border-slate-200/60" role="tablist" aria-label="Chế độ xem lịch">
                  {[['week', 'Theo Tuần'], ['day', 'Theo Ngày'], ['ultradian', 'Phân tích Ultradian']].map(([v, label]) => (
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
                <button
                  type="button"
                  onClick={() => autoBalance.mutate()}
                  className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100"
                >
                  AI Tối ưu Circadian Peak
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (showAdd) { closeForm(); setForm({ title: '', description: '', task_id: '', date: todayIso(), start: '14:00', end: '15:30', type: 'deep_work' }); }
                    else { setEditingId(null); setShowAdd(true); }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold"
                >
                  {showAdd && editingId ? 'Đang sửa sự kiện…' : '+ Thêm phiên học'}
                </button>
              </div>
            </div>

            {showAdd && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!form.title.trim()) { showToast('Nhập tên phiên học.', 'warning'); return; }
                  if (form.end <= form.start) { showToast('Giờ kết thúc phải sau giờ bắt đầu.', 'warning'); return; }
                  saveEvent.mutate();
                }}
                className="space-y-3 mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">{editingId ? 'Sửa sự kiện' : 'Thêm phiên học / Sự kiện mới'}</span>
                  <button type="button" onClick={closeForm} className="text-slate-400 hover:text-slate-600 text-xs">✕ Đóng</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Tên phiên học *"
                    className="col-span-1 sm:col-span-2 px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:border-blue-500"
                  />
                  <select
                    value={form.task_id || ''}
                    onChange={(e) => {
                      const selTask = tasks.find((t) => t.id === e.target.value);
                      setForm({
                        ...form,
                        task_id: e.target.value,
                        title: form.title || selTask?.title || '',
                      });
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white text-slate-700 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Gắn với bài tập (tùy chọn) --</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>{t.title} ({t.subject_code || 'Môn'})</option>
                    ))}
                  </select>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white text-slate-700 focus:outline-none focus:border-blue-500"
                  >
                    <option value="deep_work">Deep Work (Tập trung)</option>
                    <option value="class">Lớp học / Giảng đường</option>
                    <option value="self_study">Tự học</option>
                    <option value="study_break">Nghỉ ngơi (Calm Break)</option>
                  </select>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                  />
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={form.start}
                      onChange={(e) => setForm({ ...form, start: e.target.value })}
                      className="w-1/2 px-2.5 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                    />
                    <span className="text-slate-400 text-xs">đến</span>
                    <input
                      type="time"
                      value={form.end}
                      onChange={(e) => setForm({ ...form, end: e.target.value })}
                      className="w-1/2 px-2.5 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                    />
                  </div>
                  <input
                    value={form.description || ''}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Mô tả / Ghi chú mục tiêu..."
                    className="col-span-1 sm:col-span-2 px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={closeForm} className="px-3.5 py-2 rounded-xl bg-slate-200 text-slate-700 text-xs font-semibold">Hủy</button>
                  <button type="submit" disabled={saveEvent.isPending} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60">
                    {saveEvent.isPending ? 'Đang lưu...' : editingId ? 'Lưu thay đổi' : 'Lưu phiên học'}
                  </button>
                </div>
              </form>
            )}

            <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-blue-50/50 border border-blue-100/50 mt-4 text-xs text-slate-600">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-600" /> Deep Work (Alpha 10Hz)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-cyan-500" /> Giảng đường / Lab</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" /> Calm Break (Hồi phục)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-500" /> Focus Sprint cận hạn</span>
            </div>

            {view === 'week' && (
              <div className="mt-4 overflow-x-auto">
                <p className="sm:hidden text-[11px] text-slate-400 text-center pb-1">← Vuốt ngang để xem cả tuần →</p>
                <div className="min-w-[620px]">
                  <div className="grid grid-cols-8 gap-1.5 text-center pb-2 border-b border-slate-200/70 text-xs font-semibold text-slate-600">
                    <div className="text-slate-400 py-1">Giờ</div>
                    {days.map((d) => {
                      const iso = isoOf(d);
                      const isToday = iso === today;
                      return (
                        <div key={iso} className={`py-1 rounded-lg ${isToday ? 'bg-blue-100 text-blue-700 font-bold border border-blue-300' : 'bg-slate-50'}`}>
                          {dayNames[days.indexOf(d)]} ({String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(2, '0')})
                          {isToday ? ' • Hôm nay' : ''}
                        </div>
                      );
                    })}
                  </div>
                  {timelineQ.isPending && <p className="text-xs text-slate-500 py-4 text-center">Đang tải thời khóa biểu...</p>}
                  {!timelineQ.isPending && (
                    <div className="divide-y divide-slate-100 text-xs relative">
                      {SLOTS.map((slot, si) => {
                        if (slot.band) {
                          return (
                            <div key={si} className="grid grid-cols-8 gap-1.5 py-2 items-stretch min-h-[50px] bg-amber-50/20">
                              <div className="text-[11px] text-amber-700 font-medium flex items-center justify-center" title={slot.band}>🧘</div>
                              {days.map((d) => {
                                const iso = isoOf(d);
                                const bandEvents = events.filter((e) => evDay(e) === iso && e.start_time >= slot.from && e.start_time < slot.to);
                                if (bandEvents.length === 0) {
                                  return (
                                    <div key={iso} className="p-2 rounded-xl bg-amber-50/60 text-amber-800/70 text-[10px] border border-amber-100/70 hidden lg:flex items-center px-3 truncate">
                                      Calm Break
                                    </div>
                                  );
                                }
                                return (
                                  <div key={iso} className="flex flex-col gap-1 w-full">
                                    {bandEvents.map((ev) => (
                                      <div
                                        key={ev.id}
                                        className={`group/ev relative p-1.5 rounded-xl text-[10px] flex flex-col justify-center leading-tight transition ${TYPE_STYLE[ev.event_type] || TYPE_STYLE.self_study} ${ev.is_completed ? 'opacity-60 line-through' : ''}`}
                                      >
                                        <button
                                          type="button"
                                          title={`${ev.title} (bấm để ${ev.is_completed ? 'bỏ tick' : 'đánh dấu xong'})`}
                                          onClick={() => toggleEvent.mutate(ev.id)}
                                          className="w-full text-center truncate cursor-pointer hover:opacity-85"
                                        >
                                          <span className="truncate block">{ev.title.length > 20 ? `${ev.title.slice(0, 18)}…` : ev.title}</span>
                                          <span className="text-[9px] opacity-80 block">{ev.start_time} - {ev.end_time}</span>
                                        </button>
                                        <button
                                          type="button"
                                          title="Sửa sự kiện này"
                                          aria-label="Sửa sự kiện"
                                          onClick={(e) => { e.stopPropagation(); openEdit(ev); }}
                                          className="absolute -top-1 -right-6 w-4 h-4 rounded-full bg-slate-900/80 hover:bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center opacity-0 group-hover/ev:opacity-100 transition shadow-sm cursor-pointer z-10"
                                        >
                                          ✎
                                        </button>
                                        <button
                                          type="button"
                                          title="Xóa sự kiện này"
                                          aria-label="Xóa sự kiện"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (window.confirm(`Xóa sự kiện "${ev.title}"?`)) deleteEvent.mutate(ev.id);
                                          }}
                                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-900/80 hover:bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center opacity-0 group-hover/ev:opacity-100 transition shadow-sm cursor-pointer z-10"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }
                        return (
                          <div key={si} className="grid grid-cols-8 gap-1.5 py-2 items-stretch min-h-[56px]">
                            <div className="text-[11px] text-slate-400 font-medium flex flex-col items-center justify-center leading-tight bg-white/95 rounded-xl">
                              <span>{slot.label}</span>
                              {slot.sub && <span className="text-[9px] text-blue-500 uppercase">{slot.sub}</span>}
                            </div>
                            {days.map((d) => {
                              const iso = isoOf(d);
                              const slotEvents = events.filter((e) => evDay(e) === iso && e.start_time >= slot.from && e.start_time < slot.to);
                              if (slotEvents.length === 0) {
                                return (
                                  <button
                                    key={iso}
                                    type="button"
                                    title={`Thêm phiên học ngày ${iso} lúc ${slot.from}`}
                                    onClick={() => {
                                      setForm({
                                        title: '',
                                        description: '',
                                        task_id: '',
                                        date: iso,
                                        start: slot.from,
                                        end: slot.to,
                                        type: 'deep_work',
                                      });
                                      setShowAdd(true);
                                    }}
                                    className="p-1.5 rounded-xl bg-slate-50/60 hover:bg-blue-50 hover:text-blue-600 hover:border hover:border-blue-200 text-slate-300 text-[10px] flex items-center justify-center transition-all cursor-pointer group"
                                  >
                                    <span className="group-hover:hidden">—</span>
                                    <span className="hidden group-hover:inline font-bold text-xs">+</span>
                                  </button>
                                );
                              }
                              return (
                                <div key={iso} className="flex flex-col gap-1 w-full">
                                  {slotEvents.map((ev) => (
                                    <div
                                      key={ev.id}
                                      className={`group/ev relative p-1.5 rounded-xl text-[10px] flex flex-col justify-center leading-tight transition ${TYPE_STYLE[ev.event_type] || TYPE_STYLE.self_study} ${ev.is_completed ? 'opacity-60 line-through' : ''}`}
                                    >
                                      <button
                                        type="button"
                                        title={`${ev.title} (bấm để ${ev.is_completed ? 'bỏ tick' : 'đánh dấu xong'})`}
                                        onClick={() => toggleEvent.mutate(ev.id)}
                                        className="w-full text-center truncate cursor-pointer hover:opacity-85"
                                      >
                                        <span className="truncate block">{ev.title.length > 20 ? `${ev.title.slice(0, 18)}…` : ev.title}</span>
                                        <span className="text-[9px] opacity-80 block">{ev.start_time} - {ev.end_time}</span>
                                      </button>
                                      <button
                                        type="button"
                                        title="Xóa sự kiện này"
                                        aria-label="Xóa sự kiện"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (window.confirm(`Xóa sự kiện "${ev.title}"?`)) deleteEvent.mutate(ev.id);
                                        }}
                                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-900/80 hover:bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center opacity-0 group-hover/ev:opacity-100 transition shadow-sm cursor-pointer z-10"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {view === 'day' && (
              <div className="mt-4 space-y-3">
                {/* Bộ chọn ngày trong tuần */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {days.map((d) => {
                    const iso = isoOf(d);
                    const isSel = iso === (selectedDay || today);
                    const isToday = iso === today;
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => setSelectedDay(iso)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                          isSel
                            ? 'bg-blue-600 text-white shadow-xs'
                            : isToday
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {dayNames[days.indexOf(d)]} ({String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(2, '0')})
                        {isToday ? ' • Hôm nay' : ''}
                      </button>
                    );
                  })}
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  {selectedDay === today ? 'Hôm nay' : `Ngày ${selectedDay}`} ({dayEvents.length} sự kiện)
                </h3>
                {dayEvents.length === 0 && <p className="text-xs text-slate-500">Chưa có sự kiện nào cho ngày này.</p>}
                {dayEvents.map((ev) => (
                  <div key={ev.id} className={`flex items-center gap-3 p-3 rounded-2xl border ${ev.is_completed ? 'bg-white/60 border-slate-100' : 'bg-white/90 border-slate-200/70'}`}>
                    <button
                      type="button"
                      aria-label="Đánh dấu hoàn thành"
                      onClick={() => toggleEvent.mutate(ev.id)}
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${ev.is_completed ? 'bg-emerald-500 text-white' : 'border border-slate-300 text-transparent hover:border-emerald-400'}`}
                    >
                      ✓
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold text-slate-800 ${ev.is_completed ? 'line-through text-slate-400' : ''}`}>{ev.title}</p>
                      <p className="text-[11px] text-slate-500">{ev.start_time} - {ev.end_time}{ev.description ? ` • ${ev.description.slice(0, 60)}` : ''}</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Sửa sự kiện"
                      onClick={() => openEdit(ev)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      aria-label="Xóa sự kiện"
                      onClick={() => { if (window.confirm('Xóa sự kiện này?')) deleteEvent.mutate(ev.id); }}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {view === 'ultradian' && (
              <div className="mt-4 space-y-3">
                <h3 className="text-sm font-bold text-slate-800">Phân tích Ultradian (7 ngày qua)</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-2xl bg-blue-50 border border-blue-100">
                    <p className="text-lg font-bold text-blue-700">{sessions.length}</p>
                    <p className="text-[11px] text-slate-500">phiên focus</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-100">
                    <p className="text-lg font-bold text-indigo-700">{Math.round((totalMin / 60) * 10) / 10}h</p>
                    <p className="text-[11px] text-slate-500">tổng giờ sâu</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100">
                    <p className="text-lg font-bold text-emerald-700">{cycles}</p>
                    <p className="text-[11px] text-slate-500">chu kỳ 90p hoàn chỉnh</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {sessionsQ.isPending && <p className="text-xs text-slate-500">Đang tải phiên focus...</p>}
                  {!sessionsQ.isPending && sessions.length === 0 && <p className="text-xs text-slate-500">Chưa có phiên nào.</p>}
                  {sessions.slice(0, 8).map((s) => {
                    const dt = s.created_at ? new Date(s.created_at) : null;
                    const when = dt
                      ? `${dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} ${dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
                      : '';
                    return (
                      <div key={s.id} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 w-24 shrink-0">{when}</span>
                        <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${Math.min(100, Math.round((s.actual_minutes / 90) * 100))}%` }} />
                        </div>
                        <span className="font-semibold text-slate-700 w-12 text-right">{s.actual_minutes}p</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500">Chu kỳ Ultradian chuẩn: 90 phút tập trung + 15–20 phút nghỉ. Thanh càng đầy càng gần 1 chu kỳ hoàn chỉnh.</p>
              </div>
            )}
          </section>

          <div className="glass-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 border border-blue-100">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">⏱</div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-900 truncate">
                    Phiên hiện tại: {live ? live.title : upcoming ? upcoming.title : 'SQL Indexing & Tối ưu cụm DB'}
                  </span>
                  {live && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">LIVE • Đang diễn ra</span>}
                  {upcoming && !live && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">CÒN {upcoming.start_time}</span>}
                </div>
                <p className="text-xs text-slate-500">Khung giờ vàng Đỉnh Alpha buổi chiều • Tập trung cao độ 100%</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const cur = live || upcoming;
                  navigate(cur ? `/deepwork?duration=25&title=${encodeURIComponent(cur.title)}${cur.task_id ? `&taskId=${cur.task_id}` : ''}` : '/deepwork?duration=25');
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5 active:scale-95"
              >
                <span>▶</span>
                <span>Tiếp tục Sprint 25p</span>
              </button>
              <button
                type="button"
                onClick={handleMarkDone}
                disabled={markingDone}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-medium transition flex items-center gap-1 cursor-pointer disabled:opacity-60"
              >
                <span>✓</span>
                <span>{markingDone ? 'Đang lưu…' : 'Đánh dấu xong'}</span>
              </button>
            </div>
          </div>
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
                <span className="text-blue-600 font-bold">{nowHM} (Hiện tại: {pulse?.pulse_percent ?? 94}%)</span>
                <span>23:00 Đêm</span>
              </div>
              <div className="w-full h-28 relative flex items-center justify-center">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 320 120">
                  <defs>
                    <linearGradient id="waveGradientSched" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity="0.30" />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <path d="M 0,90 Q 40,20 80,30 T 160,85 T 230,25 T 320,105 L 320,120 L 0,120 Z" fill="url(#waveGradientSched)" />
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
                {pulse ? `"${pulse.recommendation}"${topTask ? ` Ưu tiên: ${topTask.title}.` : ''}` : 'Đang phân tích nhịp sinh học của bạn...'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const cur = topTask || live || upcoming;
                navigate(cur ? `/deepwork?duration=50&title=${encodeURIComponent(cur.title)}${cur.id ? `&taskId=${cur.id}` : ''}` : '/deepwork?duration=50');
              }}
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
                <h3 className="text-sm font-bold text-slate-800">Cảnh báo &amp; Lịch cận kề</h3>
              </div>
              <Link to="/planner" className="text-[11px] text-blue-600 hover:underline font-semibold">Hạn nộp đồ án →</Link>
            </div>
            <div className="space-y-2.5">
              {(() => {
                const upcomingEvents = [...events]
                  .filter((e) => !e.is_completed && evDay(e) >= today)
                  .sort((a, b) => `${evDay(a)}${a.start_time || ''}`.localeCompare(`${evDay(b)}${b.start_time || ''}`))
                  .slice(0, 4);
                if (upcomingEvents.length === 0) {
                  return (
                    <div className="p-3 rounded-2xl bg-white/70 border border-slate-100 text-center text-[11px] text-slate-500">
                      Không còn sự kiện nào sắp tới. Thêm phiên học ở lưới tuần bên trên.
                    </div>
                  );
                }
                return upcomingEvents.map((ev) => (
                  <div key={ev.id} className="p-3 rounded-2xl bg-white/70 border border-slate-100 hover:bg-white transition-all flex items-center justify-between gap-2 shadow-2xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold uppercase leading-none">{evDay(ev).slice(5)}</span>
                        <span className="text-xs font-bold leading-none mt-0.5">{(ev.start_time || '').slice(0, 5)}</span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-slate-800 truncate">{ev.title}</span>
                        <span className="text-[11px] text-slate-500 truncate">
                          {TYPE_LABEL[ev.event_type] || 'Sự kiện'}{evDay(ev) === today ? ' • Hôm nay' : ` • ${evDay(ev).slice(5)}`}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleEvent.mutate(ev.id)}
                      disabled={toggleEvent.isPending}
                      className="px-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60 text-emerald-700 text-xs font-bold shrink-0 border border-emerald-100 transition"
                    >
                      Xong ✓
                    </button>
                  </div>
                ));
              })()}
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

      {/* Floating next session */}
      <div className="glass-card bg-white/95 rounded-2xl p-3 px-5 border border-white/90 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-100/80 flex items-center justify-center text-blue-600 shrink-0">⏳</div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-900 truncate">
                {upcoming ? `Phiên học tiếp theo: ${upcoming.title}` : 'Hôm nay đã hoàn thành hết phiên học. Tuyệt vời!'}
              </span>
              {upcoming && (
                <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {Math.max(25, (parseInt(upcoming.end_time.slice(0, 2)) * 60 + parseInt(upcoming.end_time.slice(3)))
                    - (parseInt(upcoming.start_time.slice(0, 2)) * 60 + parseInt(upcoming.start_time.slice(3))))} phút
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              {upcoming ? `${upcoming.start_time} - ${upcoming.end_time}${upcoming.description ? ` • ${upcoming.description.slice(0, 60)}` : ''}` : 'Hãy nghỉ ngơi hoặc chuẩn bị cho ngày mai.'}
            </p>
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
