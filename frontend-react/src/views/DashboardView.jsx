import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { useAudio } from '../contexts/AudioContext.jsx';
import { api } from '../services/api.js';
import { useFocusSummary, useInsights, usePulse, useTasks, useTimeline } from '../hooks/useApi.js';
import LmsSyncModal from '../components/LmsSyncModal.jsx';

// Port pixel-faithful temp/pages-backup/pages/10-dashboard/index.html.
// Header/nav/notify do AppShell cung cấp → view chỉ render nội dung + floating bar.

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return ['buổi sáng', '🌤️'];
  if (h < 14) return ['buổi trưa', '☀️'];
  if (h < 18) return ['buổi chiều', '🌇'];
  return ['buổi tối', '🌙'];
}

const MOODS = [
  { value: 'alpha_flow', emoji: '🌅', title: 'Tràn đầy năng lượng', sub: 'Đỉnh sóng não Alpha' },
  { value: 'calm_focus', emoji: '🌊', title: 'Điềm tĩnh & Chú tâm', sub: 'Dòng chảy sâu bền' },
  { value: 'need_break', emoji: '🍃', title: 'Hơi mỏi mắt', sub: 'Cần nghỉ ngơi 5p' },
  { value: 'rest_mode', emoji: '🌙', title: 'Sẵn sàng ngủ ngon', sub: 'Phục hồi tế bào não' },
];

const MOOD_EMOJI = Object.fromEntries(MOODS.map((m) => [m.value, m.emoji]));
const SLEEP_OPTS = [0, 15, 30, 45, 60];

export default function DashboardView() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const audio = useAudio();
  const [showLmsModal, setShowLmsModal] = useState(false);
  const [part, icon] = greeting();
  const firstName = user?.full_name ? user.full_name.trim().split(' ').slice(-2).join(' ') : 'bạn';

  const pulseQ = usePulse();
  const focusQ = useFocusSummary();
  const tasksQ = useTasks();
  const timelineQ = useTimeline();
  const insightsQ = useInsights();

  const pulse = pulseQ.data;
  const focus = focusQ.data;
  const tasks = Array.isArray(tasksQ.data) ? tasksQ.data : [];
  const events = Array.isArray(timelineQ.data) ? timelineQ.data : [];
  const insights = Array.isArray(insightsQ.data) ? insightsQ.data : [];
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  const [mood, setMood] = useState(null);
  const [moodNote, setMoodNote] = useState('');
  const [adapting, setAdapting] = useState(false);
  const [applyingIdx, setApplyingIdx] = useState(null);

  const moodTodayQ = useQuery({
    queryKey: ['mood-today'],
    queryFn: () => api.get('/moods/today'),
    staleTime: 60000,
  });
  const moodEntries = moodTodayQ.data?.entries || [];

  const saveMood = useMutation({
    mutationFn: ({ mood: md, note }) => api.post('/moods/', { mood: md, note: note?.trim() || null }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['mood-today'] });
      qc.invalidateQueries({ queryKey: ['pulse'] });
      setMood(null);
      setMoodNote('');
      showToast(res?.message || 'Đã lưu cảm xúc vào nhật ký hệ thống!', 'success');
    },
    onError: (err) => showToast(err.message || 'Không lưu được cảm xúc.', 'error'),
  });

  const toggleEvent = useMutation({
    mutationFn: (id) => api.patch(`/schedule/events/${id}/toggle`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeline'] });
      showToast('Đã cập nhật trạng thái sự kiện thời khóa biểu!', 'success');
    },
    onError: (err) => showToast(err.message, 'error'),
  });

  const toggleDashboardTask = async (taskId, checked) => {
    try {
      const list = await api.get('/tasks/');
      const task = (Array.isArray(list) ? list : []).find((t) => t.id === taskId);
      const subs = task?.subtasks || [];
      const target = checked ? subs.find((s) => !s.is_completed) : [...subs].reverse().find((s) => s.is_completed);
      if (!target) {
        showToast(checked ? 'Nhiệm vụ này đã hoàn thành hết micro-sprints.' : 'Không có gì để bỏ tick.', 'info');
        return;
      }
      const updated = await api.patch(`/tasks/subtasks/${target.id}/toggle`);
      showToast(updated.is_completed ? 'Đã hoàn thành 1 micro-sprint!' : 'Đã bỏ tick 1 micro-sprint.', 'success');
      qc.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err) {
      showToast(err.message || 'Không cập nhật được.', 'error');
    }
  };

  const autoBalance = async () => {
    setAdapting(true);
    try {
      const res = await api.post('/schedule/auto-balance', {});
      showToast(res.message || 'Đã thích ứng lịch theo nhịp sinh học!', 'success');
      qc.invalidateQueries({ queryKey: ['timeline'] });
    } catch (err) {
      showToast(err.message || 'Không thích ứng được.', 'error');
    } finally {
      setAdapting(false);
    }
  };

  const applyInsight = async (ins, idx) => {
    setApplyingIdx(idx);
    try {
      const label = (ins.action_label || '').toLowerCase();
      if (label.includes('nhắc')) {
        const [sh, sm] = String(ins.suggested_time || '19:30').split(':').map(Number);
        const endMin = (sm || 30) + 30;
        const endH = (sh || 19) + Math.floor(endMin / 60);
        await api.post('/schedule/events', {
          title: `Nhắc nhở: ${ins.title}`,
          description: ins.detail || '',
          event_date: new Date().toISOString().slice(0, 10),
          start_time: ins.suggested_time || '19:30',
          end_time: `${String(endH).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`,
          event_type: 'self_study',
          is_circadian_optimized: true,
        });
        showToast('Đã tạo nhắc nhở trong lịch!', 'success');
      } else {
        const res = await api.post('/schedule/auto-balance', {});
        showToast(res.message || 'Đã áp dụng vào lịch!', 'success');
      }
      qc.invalidateQueries({ queryKey: ['timeline'] });
    } catch (err) {
      showToast(err.message || 'Không thực hiện được.', 'error');
    } finally {
      setApplyingIdx(null);
    }
  };

  const cycleSleep = () => {
    const cur = audio.sleepMinutes || 0;
    const nextMin = SLEEP_OPTS[(SLEEP_OPTS.indexOf(cur) + 1) % SLEEP_OPTS.length];
    audio.setSleepTimer(nextMin);
    showToast(nextMin > 0 ? `Hẹn tắt âm thanh sau ${nextMin} phút.` : 'Đã tắt hẹn giờ.', 'info');
  };

  const prevTrack = () => {
    const keys = Object.keys((typeof window !== 'undefined' && window.CALM_TRACKS) || { ocean: 1, rain: 1, binaural: 1 });
    const cur = keys.indexOf(audio.track?.id);
    audio.switchTrack(keys[(cur - 1 + keys.length) % keys.length]);
  };

  const scrollToSchedule = () => {
    document.getElementById('schedule')?.scrollIntoView({ behavior: 'smooth' });
  };

  const nowHM = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  const upcoming = events
    .filter((e) => !e.is_completed && e.end_time > nowHM)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0];

  const dateLine = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const effDiff = focus ? Math.round((focus.today_focus_hours - (focus.yesterday_hours || 0)) * 10) / 10 : 0;

  return (
    <div className="max-w-[1440px] w-full mx-auto p-4 md:p-6 lg:p-8 space-y-6 pb-28">
      {/* BEGIN: WelcomeAndCircadian */}
      <section className="glass-card rounded-3xl p-6 lg:p-7 relative overflow-hidden" data-purpose="welcome-banner">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-blue-100/60 text-blue-700 text-xs font-medium">
              <span>{dateLine}</span>
              <span>•</span>
              <span>Học kỳ I / Năm {user?.academic_year || 3}</span>
              <span>•</span>
              <span>{user?.university || 'ĐHQG TP.HCM'} • {user?.major || 'Công nghệ Thông tin'}</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Chào {part}, {firstName} <span className="inline-block text-2xl">{icon}</span>
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed font-normal">
              Hôm nay bạn muốn hoàn thành điều gì? Stuđiô AI đã đồng bộ & cân bằng lịch trình học tập theo nhịp sinh học tự nhiên, giúp tâm trí bạn luôn thư thái suốt ngày dài.
            </p>
          </div>
          <div className="w-full lg:w-auto bg-gradient-to-r from-blue-50/90 to-indigo-50/90 border border-blue-200/80 rounded-2xl p-4 flex items-center justify-between lg:justify-start gap-4 shrink-0 shadow-sm">
            <div className="relative flex items-center justify-center w-14 h-14 rounded-full bg-white shadow-inner border border-blue-100">
              <svg className="w-14 h-14 transform -rotate-90" viewBox="0 0 36 36">
                <path className="text-slate-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                <path className="text-brand-600 stroke-current" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" strokeDasharray={`${pulse?.pulse_percent ?? 0}, 100`} strokeLinecap="round" strokeWidth="3" />
              </svg>
              <span className="absolute text-xs font-bold text-brand-700">{pulse ? `${pulse.pulse_percent}%` : '--'}</span>
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
                </svg>
                <span className="text-[11px] font-bold tracking-wide uppercase text-blue-700">AI CIRCADIAN PULSE</span>
              </div>
              <p className="text-xs font-semibold text-slate-800">{pulse ? `Khung giờ vàng: ${pulse.golden_hour_range}` : 'Đang tải nhịp sinh học...'}</p>
              <p className="text-[11px] text-slate-500">{pulse ? `${pulse.current_brainwave_state} • Sẵn sàng học sâu` : 'Đang phân tích sóng não...'}</p>
            </div>
            <button type="button" onClick={scrollToSchedule} className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/60 transition border border-transparent hover:border-blue-100">
              Lộ trình →
            </button>
          </div>
        </div>
      </section>

      {/* BEGIN: MetricsCards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-purpose="kpi-metrics-row">
        <div className="glass-card rounded-2xl p-5 relative overflow-hidden group hover:shadow-md transition">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Thời gian học hôm nay</span>
            <span className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{focus ? `${focus.today_focus_hours}h` : '--'}</span>
            <span className="text-xs text-slate-500">/ {focus ? `${focus.target_hours}h` : '--'} mục tiêu</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-2">
            <div className="bg-blue-600 h-full rounded-full transition-all duration-500" style={{ width: `${focus?.progress_percent ?? 0}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span className="text-blue-600 font-medium">{focus ? `Tiến độ ${focus.progress_percent}%` : 'Đang tải...'}</span>
            <span />
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 relative overflow-hidden group hover:shadow-md transition">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Nhiệm vụ trọng tâm</span>
            <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{tasksQ.isPending ? '--/--' : `${completedCount}/${tasks.length}`}</span>
            <span className="text-xs text-slate-500">hoàn thành</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-2">
            <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span className="text-emerald-600 font-medium">{tasksQ.isPending ? 'Đang tải...' : `${tasks.length - completedCount} việc còn lại`}</span>
            <span />
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 relative overflow-hidden group hover:shadow-md transition">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Hiệp tập trung sâu</span>
            <span className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{focus ? `${focus.completed_sessions} phiên` : '-- phiên'}</span>
            <span className="text-xs text-slate-500">({focus ? Math.round(focus.today_focus_hours * 60) : '--'} phút)</span>
          </div>
          <div className="flex items-center gap-1.5 my-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className={`w-2.5 h-2 rounded-full ${focus && i < Math.min(focus.completed_sessions, 6) ? 'bg-indigo-600' : 'bg-slate-200'}`} />
            ))}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>{focus ? `${focus.total_distractions} lần phân tâm` : 'Đang tải...'}</span>
            <span className="text-indigo-600 font-medium">{focus?.calm_quality || ''}</span>
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 relative overflow-hidden group hover:shadow-md transition">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Hiệu suất tĩnh lặng</span>
            <span className="w-7 h-7 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center text-xs">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{focus ? `${focus.efficiency_percent || 0}%` : '--%'}</span>
            <span className="text-xs text-emerald-600 font-medium">{focus ? `${effDiff >= 0 ? `+${effDiff}` : effDiff}h vs hôm qua` : 'Đang tải...'}</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-2">
            <div className="bg-teal-500 h-full rounded-full transition-all duration-500" style={{ width: `${focus?.efficiency_percent ?? 0}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span className="text-teal-700 font-medium">{focus?.calm_quality || ''}</span>
            <span />
          </div>
        </div>
      </section>

      {/* BEGIN: DashboardBodyGrid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-6">
          {/* SECTION A: Circadian Timeline */}
          <section className="glass-card rounded-3xl p-6 relative" data-purpose="circadian-timeline" id="schedule">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-800">Lịch trình Sinh học Hôm nay</h2>
                  <p className="text-xs text-slate-500">Cân đối giữa tập trung sâu và quãng nghỉ phục hồi sóng não</p>
                </div>
              </div>
              <button type="button" onClick={autoBalance} disabled={adapting} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50/80 hover:bg-blue-100/80 rounded-full transition disabled:opacity-60">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                {adapting ? 'Đang thích ứng...' : 'Tự động thích ứng thời gian thực'}
              </button>
            </div>
            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
              {timelineQ.isPending ? (
                <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100 text-center">
                  <span className="animate-spin inline-block w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full" />
                  <p className="text-xs text-slate-500 mt-2">Đang tải thời khóa biểu...</p>
                </div>
              ) : events.length === 0 ? (
                <div className="p-4 rounded-2xl bg-white/70 border border-slate-200/70 text-center space-y-1.5">
                  <p className="text-xs font-bold text-slate-800">Lịch hôm nay trống.</p>
                  <p className="text-[11px] text-slate-500">Bấm &quot;Tự động thích ứng&quot; hoặc sang Lịch trình để AI xếp phiên học vào khung giờ vàng.</p>
                </div>
              ) : (
                events.slice(0, 5).map((ev) => {
                  const isDone = ev.is_completed;
                  const isDeep = ev.event_type === 'deep_work';
                  return (
                    <div key={ev.id} className="relative group">
                      <span className={`absolute -left-6 top-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] ring-4 ring-white shadow-sm ${isDone ? 'bg-emerald-500 text-white' : isDeep ? 'bg-brand-600 text-white animate-pulse' : 'bg-slate-300 text-white'}`}>
                        {isDone ? '✓' : isDeep ? '▶' : '🕒'}
                      </span>
                      <div className={`transition rounded-2xl p-3.5 border flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs ${isDeep && !isDone ? 'bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-blue-500/5 border-2 border-brand-500/40 shadow-md' : 'bg-white/70 hover:bg-white/95 border-slate-100'}`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-500">{ev.start_time} - {ev.end_time}</span>
                            <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${isDone ? 'bg-emerald-100/70 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                              {isDone ? 'Đã hoàn thành' : isDeep ? 'Khung giờ vàng Alpha' : 'Lịch trình'}
                            </span>
                          </div>
                          <h3 className={`text-sm font-semibold text-slate-800 mt-0.5 ${isDone ? 'line-through text-slate-400' : ''}`}>{ev.title}</h3>
                          <p className="text-xs text-slate-500">{ev.description || ''}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleEvent.mutate(ev.id)}
                          disabled={toggleEvent.isPending}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition self-start sm:self-center disabled:opacity-60 ${isDone ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white hover:bg-blue-50 text-slate-600 border-slate-200'}`}
                        >
                          {isDone ? 'Đã xong ✓' : 'Hoàn tất'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* SECTION B: AI Task Sprints */}
          <section className="glass-card rounded-3xl p-6 relative" data-purpose="tasks-sprint-section">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-800">Nhiệm vụ & Đề án Cần Hoàn Thành</h2>
                  <p className="text-xs text-slate-500">Đã chia nhỏ thông minh bởi AI để giảm tải áp lực</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowLmsModal(true)}
                  className="text-xs font-semibold text-slate-700 hover:text-blue-700 bg-white hover:bg-blue-50/80 px-3 py-1.5 rounded-lg border border-slate-200 transition flex items-center gap-1.5 shadow-2xs"
                >
                  <span>🔄</span>
                  <span>Đồng bộ LMS</span>
                </button>
                <Link to="/tasks" className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 transition">
                  + Thêm bài tập
                </Link>
              </div>
            </div>
            <div className="space-y-3.5" aria-live="polite">
              {tasksQ.isPending ? (
                <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100 text-center">
                  <span className="animate-spin inline-block w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full" />
                  <p className="text-xs text-slate-500 mt-2">Đang tải nhiệm vụ...</p>
                </div>
              ) : tasks.length === 0 ? (
                <div className="p-6 rounded-2xl bg-white/70 border border-slate-200/70 text-center space-y-2">
                  <p className="text-sm font-bold text-slate-800">Chưa có nhiệm vụ nào.</p>
                  <p className="text-xs text-slate-500">Bấm &quot;+ Thêm bài tập&quot; để tạo việc đầu tiên của bạn.</p>
                </div>
              ) : (
                <>
                  {tasks.slice(0, 3).map((t) => {
                    const pct = t.total_sprints > 0 ? Math.round((t.completed_sprints / t.total_sprints) * 100) : 0;
                    const isPriorityHigh = t.priority === 'high';
                    const isDone = t.status === 'completed';
                    return (
                      <div key={t.id} className="p-4 rounded-2xl bg-white/70 border border-slate-200/70 hover:shadow-sm transition space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <input type="checkbox" checked={isDone} onChange={(e) => toggleDashboardTask(t.id, e.target.checked)} className="mt-1 rounded text-blue-600 focus:ring-blue-400 border-slate-300 w-4 h-4 cursor-pointer" />
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className={`text-sm font-bold text-slate-800 ${isDone ? 'line-through text-slate-400' : ''}`}>{t.title}</h3>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${isPriorityHigh ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {isPriorityHigh ? 'Ưu tiên Cao' : 'Tiêu chuẩn'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">({t.subject_name})</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">{t.description || 'Bài tập bẻ khóa bởi AI Deconstructor'}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => navigate(`/deepwork?taskId=${t.id}&title=${encodeURIComponent(t.title)}`)}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 whitespace-nowrap bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition"
                          >
                            Học sâu →
                          </button>
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                            <span>Tiến độ: <strong>{t.completed_sprints}/{t.total_sprints} sprints</strong></span>
                            <span className={`font-bold ${pct >= 100 ? 'text-emerald-600' : 'text-blue-600'}`}>{pct}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-blue-600 h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {tasks.length > 3 && (
                    <Link to="/tasks" className="block text-center text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline py-2">
                      Xem tất cả {tasks.length} nhiệm vụ →
                    </Link>
                  )}
                </>
              )}
            </div>
          </section>
        </div>

        <div className="lg:col-span-4 space-y-6">
          {/* WIDGET 1: 432Hz Audio Player */}
          <section className="glass-card rounded-3xl p-5 space-y-4 relative overflow-hidden" data-purpose="ambient-audio-player">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path clipRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" fillRule="evenodd" />
                  </svg>
                </span>
                <h3 className="text-sm font-bold text-slate-800">Âm thanh Nền Tĩnh Lặng</h3>
              </div>
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${audio.isPlaying ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-100 border-slate-200'}`}>
                {audio.isPlaying ? 'ĐANG PHÁT' : 'TẠM DỪNG'}
              </span>
            </div>
            <div className="relative rounded-2xl overflow-hidden p-4 bg-gradient-to-br from-blue-900/90 via-indigo-900/85 to-slate-900/90 text-white shadow-inner">
              <div className="relative z-10 space-y-2">
                <span className="text-[10px] tracking-wider uppercase font-semibold bg-white/20 px-2 py-0.5 rounded text-blue-100">
                  {audio.track?.subtitle || '432HZ ALPHA TUNE'}
                </span>
                <h4 className="text-sm font-bold leading-snug">{audio.track?.title || 'Sóng Biển Hải Đăng & Mưa Rơi'}</h4>
                <p className="text-xs text-blue-200/80">Âm thanh kích hoạt sóng não thư thái</p>
                <div className="flex items-end gap-1 h-5 pt-1">
                  {[0.8, 1.2, 0.7, 1.5, 0.9, 1.3, 1.1, 0.6].map((d, i) => (
                    <span
                      key={i}
                      className="w-1 bg-blue-300/80 rounded-full audio-wave-bar"
                      style={{ animationDuration: `${d}s`, height: '100%', animationPlayState: audio.isPlaying ? 'running' : 'paused' }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <button type="button" aria-label="Bài trước" onClick={prevTrack} className="text-slate-400 hover:text-slate-600 transition">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" /></svg>
              </button>
              <button type="button" aria-label="Tạm dừng hoặc phát" onClick={audio.togglePlay} className="w-10 h-10 rounded-full bg-brand-600 text-white flex items-center justify-center shadow hover:bg-brand-700 transition">
                {audio.isPlaying ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" fillRule="evenodd" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" fillRule="evenodd" /></svg>
                )}
              </button>
              <button type="button" aria-label="Bài tiếp" onClick={audio.nextTrack} className="text-slate-400 hover:text-slate-600 transition">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798L4.555 5.168z" /></svg>
              </button>
              <div className="flex items-center gap-1.5 w-28">
                <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" fillRule="evenodd" /></svg>
                <input type="range" min="0" max="100" value={Math.round(audio.volume * 100)} onChange={(e) => audio.setVolume(parseInt(e.target.value, 10) / 100)} aria-label="Âm lượng" className="w-full h-1 accent-blue-600 cursor-pointer" />
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <button type="button" onClick={cycleSleep} title="Bấm để đổi hẹn giờ tắt" className="flex items-center gap-1 hover:text-blue-700 transition">
                <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                <span>Hẹn giờ tắt: {(audio.sleepMinutes || 0) > 0 ? `${audio.sleepMinutes} phút` : 'Tắt'}</span>
              </button>
              <Link to="/sound" className="text-blue-600 hover:underline font-medium">Bộ trộn âm →</Link>
            </div>
          </section>

          {/* WIDGET 2: Circadian Insights */}
          <section className="glass-card rounded-3xl p-5 space-y-3.5 relative" data-purpose="ai-circadian-insights">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-purple-100 text-purple-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </span>
                <h3 className="text-sm font-bold text-slate-800">Đề Xuất Nhịp Sinh Học</h3>
              </div>
              <span className="w-2 h-2 rounded-full bg-purple-500" />
            </div>
            {insightsQ.isPending && <p className="text-xs text-slate-500">Đang phân tích nhịp sinh học...</p>}
            {insightsQ.isError && <p className="text-xs text-rose-600">Không tải được đề xuất AI.</p>}
            {insights.map((ins, i) => (
              <div key={i} className="p-3 rounded-xl bg-purple-50/50 border border-purple-100/70 space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="text-sm">{['💡', '💧', '🔔'][i % 3]}</span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">{ins.title}</h4>
                    <p className="text-[11px] text-slate-600 leading-normal">{ins.detail}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-purple-700 font-semibold">Độ tin cậy: {ins.confidence}{ins.suggested_time ? ` • ${ins.suggested_time}` : ''}</span>
                  <button
                    type="button"
                    onClick={() => applyInsight(ins, i)}
                    disabled={applyingIdx === i}
                    className="text-[11px] px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-medium transition"
                  >
                    {applyingIdx === i ? 'Đang áp dụng...' : ins.action_label || 'Áp dụng lịch'}
                  </button>
                </div>
              </div>
            ))}
          </section>

          {/* WIDGET 3: Mood check-in */}
          <section className="glass-card rounded-3xl p-5 space-y-3 relative" data-purpose="mood-checkin">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-base leading-none">🌱</span>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Ghi Nhận Cảm Xúc Hôm Nay</h3>
                <p className="text-[11px] text-slate-500">Giúp Cố vấn AI điều chỉnh cường độ học tập phù hợp</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMood(m.value)}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer ${mood === m.value ? 'ring-2 ring-emerald-500 bg-white border-emerald-300' : 'hover:bg-slate-50 bg-white/60 border-slate-200'}`}
                >
                  <span className="text-xl block mb-1">{m.emoji}</span>
                  <span className="font-bold text-slate-800 block text-xs">{m.title}</span>
                  <span className="text-[10px] text-slate-500">{m.sub}</span>
                </button>
              ))}
            </div>
            <input
              type="text"
              value={moodNote}
              onChange={(e) => setMoodNote(e.target.value)}
              placeholder="Hôm nay đã giải quyết xong bài tập lớn..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 text-xs font-medium outline-none"
            />
            <button
              type="button"
              onClick={() => mood && saveMood.mutate({ mood, note: moodNote })}
              disabled={!mood || saveMood.isPending}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-semibold shadow-md shadow-emerald-500/25 transition"
            >
              {saveMood.isPending ? 'Đang lưu...' : 'Lưu cảm xúc'}
            </button>
            {moodEntries.length > 0 && (
              <div className="pt-1 space-y-1.5">
                {moodEntries.slice(0, 3).map((e) => (
                  <div key={e.id} className="flex items-start gap-2 text-[11px] text-slate-600 bg-white/60 border border-slate-100 rounded-xl px-2.5 py-1.5">
                    <span className="text-sm">{MOOD_EMOJI[e.mood] || '🌊'}</span>
                    <span className="flex-1">{e.note || MOODS.find((m) => m.value === e.mood)?.title}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* WIDGET 4: Quick Action Grid */}
          <section className="glass-card rounded-3xl p-5 space-y-3" data-purpose="quick-actions">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Thao tác Nhanh</h3>
            <div className="grid grid-cols-2 gap-2">
              <Link to="/tasks" className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl bg-white/70 hover:bg-white text-xs font-medium text-slate-700 border border-slate-200/80 transition">
                <span>✏️</span><span>+ Thêm việc</span>
              </Link>
              <Link to="/schedule" className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl bg-white/70 hover:bg-white text-xs font-medium text-slate-700 border border-slate-200/80 transition">
                <span>📅</span><span>Tạo lịch</span>
              </Link>
              <Link to="/deepwork" className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl bg-white/70 hover:bg-white text-xs font-medium text-slate-700 border border-slate-200/80 transition">
                <span>⚡</span><span>Tập trung ngay</span>
              </Link>
              <Link to="/planner" className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl bg-white/70 hover:bg-white text-xs font-medium text-slate-700 border border-slate-200/80 transition">
                <span>🪄</span><span>Kế hoạch AI</span>
              </Link>
            </div>
          </section>

          {/* Next session card */}
          <section className="glass-card rounded-3xl p-5 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Phiên học tiếp theo</h3>
            {upcoming ? (
              <div>
                <p className="text-sm font-bold text-slate-900">{upcoming.title}</p>
                <p className="text-xs text-slate-500">{upcoming.start_time} - {upcoming.end_time}{upcoming.description ? ` • ${upcoming.description}` : ''}</p>
                <button
                  type="button"
                  onClick={() => navigate('/deepwork')}
                  className="mt-3 w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-semibold hover:shadow-lg transition"
                >
                  Vào phiên học ngay
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Hôm nay đã hoàn thành hết phiên học. Tuyệt vời!</p>
            )}
          </section>
        </div>
      </div>

      {/* BEGIN: FloatingFocusBar */}
      <div className="fixed bottom-4 inset-x-4 max-w-4xl mx-auto z-50">
        <div className="glass-card bg-white/95 rounded-2xl p-3 px-5 border border-white/90 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100/80 flex items-center justify-center text-blue-600 shrink-0">⏳</div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">
                  {upcoming ? `Phiên học tiếp theo: ${upcoming.title}` : 'Hôm nay đã hoàn thành hết phiên học. Tuyệt vời!'}
                </span>
                {upcoming && (
                  <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{upcoming.start_time} - {upcoming.end_time}</span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">{upcoming ? upcoming.description || 'Âm thanh kích hoạt sóng não: Tiếng mưa rơi tĩnh lặng & Nhịp điệu Lo-Fi biển' : 'Hãy nghỉ ngơi hoặc chuẩn bị cho ngày mai.'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={() => navigate('/sound')} className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 transition">
              ⚙️ Cài đặt âm thanh
            </button>
            <button type="button" onClick={() => navigate('/deepwork')} className="px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-sm shadow-blue-500/20 transition flex items-center gap-1">
              <span>Bắt đầu Pomodoro</span><span>🍅</span>
            </button>
          </div>
        </div>
      </div>

      <LmsSyncModal isOpen={showLmsModal} onClose={() => setShowLmsModal(false)} />
    </div>
  );
}
