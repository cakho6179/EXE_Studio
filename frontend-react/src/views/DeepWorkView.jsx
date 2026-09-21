import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { useToast } from '../contexts/ToastContext.jsx';
import { useAudio } from '../contexts/AudioContext.jsx';

const DIAL_C = 691; // 2*PI*110
const PERSIST_KEY = 'studi_deep_timer';

const fmt = (s) => {
  const v = Math.max(0, Math.floor(s || 0));
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};

// Máy trạng thái chặng: focus -> break -> focus... (port từ 16-deep-work-active)
function buildLegs(minutes) {
  if (minutes === 25) return [{ kind: 'focus', minutes: 25 }, { kind: 'break', minutes: 5 }, { kind: 'focus', minutes: 25 }];
  if (minutes === 45) return [{ kind: 'focus', minutes: 45 }, { kind: 'break', minutes: 15 }];
  if (minutes === 90) return [{ kind: 'focus', minutes: 90 }];
  return [{ kind: 'focus', minutes: 50 }, { kind: 'break', minutes: 10 }];
}

const AI_LABEL = {
  free: 'Chế độ tự do • Đếm lên',
  25: 'Pomodoro chuẩn • Tối đa sức bật',
  45: 'Nhịp trường học chuẩn • Cân bằng',
  50: 'Khuyến nghị AI • Đỉnh Alpha',
  90: 'Đỉnh Chu kỳ Ultradian • Siêu tập trung',
};

const SOUND_LABEL = {
  ocean: 'Sóng Biển Hải Đăng 432Hz',
  rain: 'Mưa Rơi Bên Hiên Gỗ',
  brown: 'Tiếng Ồn Nâu Thư Thái (Brown Noise)',
  coffee: 'Quán Cà Phê Mùa Thu Zen',
  silence: 'Im Lặng Tuyệt Đối (Pure Silence)',
};

// ocean/rain có synth thật; brown/coffee fallback ocean; silence = không phát
const toEngineTrack = (k) => {
  if (k === 'ocean' || k === 'brown' || k === 'coffee') return 'ocean';
  if (k === 'rain') return 'rain';
  return null;
};

const PRESETS = [
  [25, '25m', '(Pomodoro)'],
  [45, '45m', '(Nhịp học trường)'],
  [50, '50m', '(Chuyên sâu)'],
  [90, '90m', '(Chu kỳ Ultradian)'],
];

const QUICK_CHIPS = [
  ['ocean', 'Sóng Biển Hải Đăng (432Hz)'],
  ['rain', 'Mưa Rơi Hiên Gỗ'],
  ['brown', 'Tiếng Ồn Nâu'],
  ['silence', 'Im Lặng'],
];

function initTimerState(initDur, free) {
  if (free) return { legs: [{ kind: 'free', minutes: 0 }], phaseIdx: 0, remaining: 0, focusElapsed: 0, elapsedUp: 0 };
  const legs = buildLegs(initDur);
  return { legs, phaseIdx: 0, remaining: legs[0].minutes * 60, focusElapsed: 0, elapsedUp: 0 };
}

export default function DeepWorkView() {
  const { showToast } = useToast();
  const { switchTrack, togglePlay, engine } = useAudio();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const paramTaskId = params.get('taskId') || '';
  const paramTitle = params.get('title') || '';
  const paramDuration = params.get('duration') ? parseInt(params.get('duration')) : null;
  const paramSound = params.get('sound') || '';
  const paramMode = params.get('mode') || '';

  const [duration, setDurationState] = useState(paramDuration || 50);
  const [tm, setTm] = useState(() => {
    try {
      // Khôi phục phiên cũ nếu không có param mới (tránh đè param)
      if (!paramDuration) {
        const raw = localStorage.getItem(PERSIST_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (s && typeof s.remaining === 'number' && Date.now() - (s.savedAt || 0) < 3 * 3600 * 1000 && Array.isArray(s.legs) && s.legs.length) {
            return { legs: s.legs, phaseIdx: Math.min(s.phaseIdx || 0, s.legs.length - 1), remaining: s.remaining, focusElapsed: s.totalFocusElapsed || 0, elapsedUp: s.elapsedUpSeconds || 0 };
          }
        }
      }
    } catch { /* bỏ qua */ }
    return initTimerState(paramDuration || 50, paramMode === 'free');
  });
  const [running, setRunning] = useState(false);
  const [ended, setEnded] = useState(false);
  const [title, setTitle] = useState(paramTitle);
  const [taskId, setTaskId] = useState(paramTaskId || null);
  const [sound, setSound] = useState(paramSound || 'ocean');
  const [pacing, setPacing] = useState(paramMode === 'free' ? 'free' : String(paramDuration || 50));
  const [distractions, setDistractions] = useState(0);
  const [notes, setNotes] = useState('');
  const [completeNext, setCompleteNext] = useState(true);
  const [showSuggest, setShowSuggest] = useState(false);
  const [shield, setShield] = useState(() => {
    try { return localStorage.getItem('studi_shield') !== 'off'; } catch { return true; }
  });
  const completedRef = useRef(false);

  // Khiên tập trung: ẩn header/footer khi đang chạy
  useEffect(() => {
    if (shield && running) {
      document.body.classList.add('focus-dim');
    } else {
      document.body.classList.remove('focus-dim');
    }
    return () => {
      document.body.classList.remove('focus-dim');
    };
  }, [shield, running]);

  // Cảnh báo khi người dùng rời trang lúc phiên đang chạy
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (running) {
        e.preventDefault();
        e.returnValue = 'Phiên tập trung đang diễn ra. Bạn có chắc muốn rời đi?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [running]);

  const tasksQ = useQuery({ queryKey: ['tasks'], queryFn: () => api.get('/tasks/'), staleTime: 30000 });
  const tasks = useMemo(() => (Array.isArray(tasksQ.data) ? tasksQ.data : []), [tasksQ.data]);
  const task = useMemo(() => tasks.find((t) => String(t.id) === String(taskId)) || null, [tasks, taskId]);
  const subs = task?.subtasks || [];
  const doneSubs = subs.filter((s) => s.is_completed).length;

  // Auto-select task pending đầu tiên khi chưa có task (port hành vi 15)
  useEffect(() => {
    if (!taskId && tasks.length && !paramTitle) {
      const pending = tasks.filter((t) => t.status !== 'completed');
      const first = (pending.length ? pending : tasks)[0];
      if (first) {
        setTaskId(first.id);
        setTitle(first.title);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const leg = tm.legs[tm.phaseIdx] || tm.legs[0];
  const isFree = leg.kind === 'free';

  // Tick 1s
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setTm((prev) => {
        const cur = prev.legs[prev.phaseIdx] || prev.legs[0];
        if (cur.kind === 'free') return { ...prev, elapsedUp: prev.elapsedUp + 1, focusElapsed: prev.focusElapsed + 1 };
        if (prev.remaining <= 0) return prev;
        return { ...prev, remaining: prev.remaining - 1, focusElapsed: cur.kind === 'focus' ? prev.focusElapsed + 1 : prev.focusElapsed };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // Persist phiên để refresh không mất
  useEffect(() => {
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify({
        taskId, title, duration, remaining: tm.remaining, running, sound,
        legs: tm.legs, phaseIdx: tm.phaseIdx, totalFocusElapsed: tm.focusElapsed, elapsedUpSeconds: tm.elapsedUp, savedAt: Date.now(),
      }));
    } catch { /* bỏ qua */ }
  }, [tm, running, title, taskId, sound, duration]);

  // Chuyển chặng / hoàn tất khi hết giờ
  useEffect(() => {
    if (!running || isFree || tm.remaining > 0) return;
    if (tm.phaseIdx < tm.legs.length - 1) {
      const nextIdx = tm.phaseIdx + 1;
      const next = tm.legs[nextIdx];
      setTm((p) => ({ ...p, phaseIdx: nextIdx, remaining: next.minutes * 60 }));
      if (next.kind === 'break') {
        engine()?.stopAll();
        showToast(`Hết chặng tập trung. Nghỉ ${next.minutes} phút: đứng dậy, uống nước, nhìn xa.`, 'info');
      } else {
        showToast(`Hết giờ nghỉ. Vào chặng tập trung ${next.minutes} phút!`, 'success');
        ensureAudio();
      }
    } else {
      completeSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tm.remaining, running, isFree]);

  function ensureAudio() {
    try {
      const eng = engine();
      if (!eng) return;
      const track = toEngineTrack(sound);
      if (!track) { if (eng.isPlaying) togglePlay(); return; }
      if (eng.currentTrackId !== track) switchTrack(track);
      if (!eng.isPlaying) togglePlay();
    } catch { /* bỏ qua */ }
  }

  function setDuration(min) {
    if (running) pauseTimer();
    setDurationState(min);
    setPacing(String(min));
    setTm(initTimerState(min, false));
    setEnded(false);
    completedRef.current = false;
  }

  function startTimer() {
    if (isFree && tm.elapsedUp === 0 && tm.focusElapsed === 0) { /* bắt đầu đếm lên */ }
    else if (!isFree && tm.remaining <= 0) {
      // Phiên cũ đã xong hết chặng -> bắt đầu vòng mới
      const fresh = initTimerState(duration, false);
      setTm(fresh);
      setEnded(false);
      completedRef.current = false;
    }
    setEnded(false);
    setRunning(true);
    ensureAudio();
    showToast('🌿 Đã kích hoạt trạng thái Deep Flow 432Hz. Hãy thở chậm và chú tâm.', 'success');
  }

  function pauseTimer() {
    setRunning(false);
    try { engine()?.stopAll(); } catch { /* bỏ qua */ }
    showToast('Đã tạm dừng phiên. Hãy thư giãn mắt một chút!', 'info');
  }

  // LƯU PHIÊN ĐÚNG endpoint POST /focus/session/complete (KHÔNG dùng /focus/sessions)
  async function completeSession() {
    if (completedRef.current) return;
    completedRef.current = true;
    setRunning(false);
    try { engine()?.stopAll(); } catch { /* bỏ qua */ }
    try { localStorage.removeItem(PERSIST_KEY); } catch { /* bỏ qua */ }
    const plannedMin = tm.legs.filter((l) => l.kind === 'focus').reduce((a, l) => a + l.minutes, 0) || duration;
    const actualMin = Math.max(1, Math.round(tm.focusElapsed / 60));
    setEnded(true);
    showToast(`Đang ghi nhận phiên học (${actualMin}p) vào cơ sở dữ liệu...`, 'info');
    try {
      const res = await api.post('/focus/session/complete', {
        task_id: taskId || null,
        planned_minutes: plannedMin,
        actual_minutes: actualMin,
        distractions_count: distractions,
        notes: notes || title || task?.title || 'Phiên Deep Work',
        ambient_sound_used: SOUND_LABEL[sound] || sound || 'Sóng Biển Hải Đăng 432Hz',
        complete_next_subtask: completeNext,
      });
      tasksQ.refetch();
      showToast(res.message || '🎉 Đã hoàn tất phiên Deep Work & cập nhật tiến độ! Chuyển về Tổng quan sau 1.5s...', 'success');
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (err) {
      showToast(`Đã xong phiên! (Không lưu được: ${err.message || 'mất mạng'})`, 'warning');
    }
  }

  function handleMainButton() {
    // Đang nghỉ mà bấm -> bỏ qua nghỉ, vào chặng tiếp
    if (running && leg.kind === 'break') {
      if (tm.phaseIdx < tm.legs.length - 1) {
        const nextIdx = tm.phaseIdx + 1;
        setTm((p) => ({ ...p, phaseIdx: nextIdx, remaining: tm.legs[nextIdx].minutes * 60 }));
        showToast('Đã bỏ qua giờ nghỉ. Tập trung nào!', 'success');
        ensureAudio();
      } else pauseTimer();
      return;
    }
    if (!title.trim()) {
      setTitle('Phiên học tập trung sâu');
    }
    if (!running) startTimer();
    else pauseTimer();
  }

  function handleReset() {
    if (isFree && tm.elapsedUp >= 60) {
      if (window.confirm(`Kết thúc phiên tự do (${fmt(tm.elapsedUp)}) và ghi nhận?`)) { completeSession(); return; }
    }
    if (running && !window.confirm('Phiên đang chạy. Dừng và đặt lại từ đầu?')) return;
    pauseTimerSilent();
    try { localStorage.removeItem(PERSIST_KEY); } catch { /* bỏ qua */ }
    setDurationState(50);
    setPacing('50');
    setTm(initTimerState(50, false));
    setEnded(false);
    completedRef.current = false;
    setSound('ocean');
    setDistractions(0);
    setNotes('');
    setTitle('');
    showToast('Đã dừng và đặt lại phiên (50m, Sóng Biển 432Hz)', 'info');
  }
  function pauseTimerSilent() { setRunning(false); try { engine()?.stopAll(); } catch { /* bỏ qua */ } }

  async function handleSchedule() {
    const t = title.trim() || 'Phiên học tập trung sâu';
    try {
      await api.post('/schedule/events', {
        task_id: taskId || null,
        title: `Học sâu: ${t.slice(0, 80)}`,
        description: `Phiên ${duration}p • Âm ${SOUND_LABEL[sound] || sound}`,
        event_date: new Date().toISOString().slice(0, 10),
        start_time: '14:00',
        end_time: '15:30',
        event_type: 'deep_work',
        is_circadian_optimized: true,
      });
      showToast('Đã gán phiên học vào Lịch Sinh học (14:00-15:30).', 'success');
    } catch (e) { showToast(e.message || 'Không gán được lịch.', 'error'); }
  }

  async function toggleSubtask(sub) {
    try {
      await api.patch(`/tasks/subtasks/${sub.id}/toggle`);
      tasksQ.refetch();
    } catch (err) { showToast(err.message || 'Lỗi.', 'error'); }
  }

  // Phím tắt: Space pause/resume, M mute/unmute
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.matches('input, textarea, select')) return;
      if (e.code === 'Space') { e.preventDefault(); handleMainButtonRef.current(); }
      if (e.key === 'm' || e.key === 'M') {
        const eng = engine();
        if (eng) {
          if (eng.isPlaying) {
            try { eng.stopAll(); } catch {}
          } else {
            ensureAudio();
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleMainButtonRef = useRef(handleMainButton);
  handleMainButtonRef.current = handleMainButton;

  useEffect(() => () => { document.title = 'Stuđiô AI - Không gian học tập tĩnh lặng'; }, []);
  useEffect(() => {
    document.title = running ? `(${fmt(isFree ? tm.elapsedUp : tm.remaining)}) Stuđiô AI - Tập trung sâu` : 'Stuđiô AI - Tập trung sâu';
  }, [running, tm.remaining, tm.elapsedUp, isFree]);

  // Vòng tròn: % đã trôi của chặng hiện tại
  const percent = useMemo(() => {
    if (isFree) return (tm.elapsedUp % 3600) / 3600;
    const total = leg.minutes * 60 || 1;
    return Math.min(1, Math.max(0, (total - tm.remaining) / total));
  }, [isFree, tm.elapsedUp, tm.remaining, leg.minutes]);
  const display = isFree ? fmt(tm.elapsedUp) : fmt(tm.remaining);

  const phaseLabel = isFree
    ? 'Chế độ tự do: bấm Dừng để kết thúc & ghi nhận'
    : leg.kind === 'break'
      ? `Chặng ${tm.phaseIdx + 1}/${tm.legs.length}: Nghỉ tĩnh ${leg.minutes} phút (mắt + nước)`
      : tm.legs.length > 1
        ? `Chặng ${tm.phaseIdx + 1}/${tm.legs.length}: Tập trung ${leg.minutes} phút`
        : 'Chu kỳ Ultradian tối ưu não bộ';

  const pendingTasks = tasks.filter((t) => t.status !== 'completed');
  const suggestList = (pendingTasks.length ? pendingTasks : tasks).slice(0, 8);

  return (
    <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8 my-auto">
      <div className="w-full max-w-3xl glass-card rounded-3xl shadow-glass border border-white/70 overflow-hidden relative">
        <div className="h-1.5 w-full bg-gradient-to-r from-brand-600 via-sky-400 to-indigo-500" />
        <div className="p-6 sm:p-9 lg:p-10">
          <header className="text-center max-w-xl mx-auto mb-8">
            <div className="inline-flex items-center justify-center mb-3">
              <div className="relative flex items-center justify-center">
                <div className="absolute -inset-1.5 rounded-full bg-gradient-to-r from-brand-400 to-blue-600 opacity-30 blur-sm aura-glow" />
                <div className="relative w-12 h-12 rounded-2xl bg-white/90 p-1.5 shadow-md flex items-center justify-center border border-white">
                  <img alt="Stuđiô AI" className="w-full h-full object-contain" src="/assets/images/logo.png" />
                </div>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-brand-50 border border-brand-200/60 text-[11px] font-bold text-brand-700 uppercase tracking-widest mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-600 animate-pulse" />
              Thiết lập phiên học • Deep Work v3.2
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight leading-snug">Khởi tạo Phiên Tập trung Sâu</h1>
            <p className="text-sm sm:text-base text-slate-600 mt-2 font-normal leading-relaxed">
              Loại bỏ xao nhãng, đồng điệu nhịp sinh học và kích hoạt trạng thái dòng chảy (<span className="text-slate-800 font-medium italic">Flow State</span>).
            </p>
          </header>

          <section aria-label="Vòng tròn điều chỉnh thời gian tập trung" className="flex flex-col items-center justify-center mb-8">
            <div className={`relative flex items-center justify-center transition-all duration-500 rounded-full p-2 ${running ? 'focus-breathing-dial' : ''}`}>
              <div className="absolute w-64 h-64 sm:w-72 sm:h-72 rounded-full border border-brand-200/50 aura-glow -z-10" />
              <div className="absolute w-72 h-72 sm:w-80 sm:h-80 rounded-full border border-sky-100/60 -z-10" />
              <svg className="w-60 h-60 sm:w-64 sm:h-64 -rotate-90 filter drop-shadow-sm" viewBox="0 0 250 250">
                <defs>
                  <linearGradient id="timerGradient" x1="0%" x2="100%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#2563eb" />
                    <stop offset="60%" stopColor="#0ea5e9" />
                    <stop offset="100%" stopColor="#38bdf8" />
                  </linearGradient>
                  <filter height="140%" id="dialShadow" width="140%" x="-20%" y="-20%">
                    <feDropShadow dx="0" dy="2" floodColor="#0284c7" floodOpacity="0.25" stdDeviation="3" />
                  </filter>
                </defs>
                <circle className="opacity-60" cx="125" cy="125" fill="transparent" r="110" stroke="#e2e8f0" strokeLinecap="round" strokeWidth="8" />
                <circle className="opacity-50" cx="125" cy="125" fill="transparent" r="118" stroke="#cbd5e1" strokeDasharray="1 12" strokeWidth="1.5" />
                <circle
                  className="timer-circle-progress"
                  cx="125" cy="125" fill="transparent" filter="url(#dialShadow)"
                  r="110" stroke="url(#timerGradient)" strokeLinecap="round" strokeWidth="10"
                  style={{ strokeDasharray: DIAL_C, strokeDashoffset: DIAL_C * (1 - percent) }}
                />
                <g transform={`rotate(${Math.round(percent * 360)} 125 125)`}>
                  <circle cx="235" cy="125" fill="#ffffff" filter="url(#dialShadow)" r="10" stroke="#2563eb" strokeWidth="4" />
                  <circle cx="235" cy="125" fill="#2563eb" r="3" />
                </g>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none pointer-events-none">
                <span className="text-4xl sm:text-5xl font-extrabold text-slate-800 tracking-tight font-mono drop-shadow-sm">{display}</span>
                <div className="mt-1 flex items-center space-x-1 text-xs font-semibold text-brand-600 bg-brand-50/80 px-2.5 py-0.5 rounded-full border border-brand-100">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path clipRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" fillRule="evenodd" />
                  </svg>
                  <span>{AI_LABEL[duration] || 'Khuyến nghị AI • Đỉnh Alpha'}</span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium mt-1">{phaseLabel}</span>
              </div>
            </div>
            <div aria-label="Chọn nhanh thời lượng" className="mt-6 flex flex-wrap items-center justify-center gap-2" role="group">
              {PRESETS.map(([m, big, small]) => {
                const active = duration === m && pacing !== 'free';
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setDuration(m); showToast(`Đã chọn mốc thời gian: ${m} phút`, 'info'); }}
                    className={active
                      ? 'px-3.5 py-1.5 rounded-xl text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-300 shadow-sm transition-all ring-2 ring-brand-400/20 active:scale-95'
                      : 'px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 bg-white/70 hover:bg-white hover:text-brand-600 border border-slate-200/80 transition-all shadow-sm active:scale-95'}
                  >
                    {big} <span className={active ? 'text-brand-600/70 font-normal' : 'text-slate-400 font-normal'}>{small}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-1.5 relative">
              <div className="flex items-center justify-between">
                <label className="text-xs sm:text-sm font-semibold text-slate-700 flex items-center gap-1.5" htmlFor="task-name-input">
                  <svg className="w-4 h-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                  Tên nhiệm vụ / Đồ án cần giải quyết
                </label>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowSuggest((v) => !v); }}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md cursor-pointer hover:bg-brand-100 transition active:scale-95 border border-brand-200/50"
                >
                  ✨ AI gợi ý từ danh sách hôm nay
                </button>
              </div>
              <div className="relative">
                <input
                  id="task-name-input"
                  className="glass-input w-full px-4 py-2.5 rounded-2xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none transition shadow-sm"
                  placeholder="VD: Hoàn thiện chương 3 Luận văn tốt nghiệp hoặc Đọc 20 trang tài liệu..."
                  type="text"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setTaskId(null); }}
                />
              </div>
              {showSuggest && (
                <div className="absolute top-full mt-2 left-0 right-0 z-30 bg-white/95 backdrop-blur-xl border border-brand-200/80 rounded-2xl shadow-xl p-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs text-slate-500 font-medium">
                    <span className="flex items-center gap-1.5 text-brand-700 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
                      Gợi ý nhiệm vụ ưu tiên từ thời khóa biểu &amp; Obsidian:
                    </span>
                    <button type="button" onClick={() => setShowSuggest(false)} className="text-slate-400 hover:text-slate-600 text-base leading-none">×</button>
                  </div>
                  <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                    {suggestList.length === 0 && <p className="text-xs text-slate-400 p-2">Chưa có nhiệm vụ nào. Tạo task mới để AI gợi ý.</p>}
                    {suggestList.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => { setTaskId(t.id); setTitle(t.title); setShowSuggest(false); showToast(`Đã nạp bài tập: ${t.title}`, 'success'); }}
                        className="p-2.5 rounded-xl hover:bg-brand-50/80 cursor-pointer text-xs sm:text-sm text-slate-700 transition flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span>🎯</span>
                          <span className="font-medium truncate">{t.title}</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200 font-medium shrink-0">
                          {t.completed_sprints || 0}/{t.total_sprints ?? t.estimated_sprints ?? 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs sm:text-sm font-semibold text-slate-700 flex items-center gap-1.5" htmlFor="duration-split-select">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                  Phân bổ chặng nghỉ (Pacing)
                </label>
                <select
                  id="duration-split-select"
                  className="glass-input w-full px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm text-slate-700 focus:outline-none transition shadow-sm cursor-pointer"
                  value={pacing}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPacing(v);
                    if (running) pauseTimerSilent();
                    if (v === 'free') {
                      setTm(initTimerState(0, true));
                      setEnded(false);
                      completedRef.current = false;
                      showToast('Chế độ đếm tự do: bấm Bắt đầu, bấm Dừng để ghi nhận số phút thật', 'info');
                    } else {
                      const n = parseInt(v);
                      if (!isNaN(n)) { setDurationState(n); setTm(initTimerState(n, false)); setEnded(false); completedRef.current = false; }
                    }
                  }}
                >
                  <option value="50">50 phút tập trung + 10 phút nghỉ tĩnh</option>
                  <option value="25">2 hiệp x 25 phút (Pomodoro kép)</option>
                  <option value="45">45 phút tập trung + 15 phút giãn cơ</option>
                  <option value="90">90 phút đơn chặng không gián đoạn (Ultradian)</option>
                  <option value="free">Tự do (Đếm thời gian tiến dần)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs sm:text-sm font-semibold text-slate-700 flex items-center gap-1.5" htmlFor="soundscape-select">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                  Không gian âm thanh đồng bộ
                </label>
                <select
                  id="soundscape-select"
                  className="glass-input w-full px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm text-slate-700 focus:outline-none transition shadow-sm font-medium cursor-pointer"
                  value={sound}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSound(v);
                    if (v === 'brown' || v === 'coffee') showToast('Âm này chưa có synth riêng, tạm dùng Sóng Biển 432Hz.', 'warning');
                    if (running) ensureAudio();
                  }}
                >
                  <option value="ocean">🌊 Sóng Biển Hải Đăng 432Hz (Đang chọn)</option>
                  <option value="rain">🌧️ Mưa Rơi Bên Hiên Gỗ</option>
                  <option value="brown">📻 Tiếng Ồn Nâu Thư Thái (Brown Noise)</option>
                  <option value="coffee">☕ Quán Cà Phê Mùa Thu Zen</option>
                  <option value="silence">🔇 Im Lặng Tuyệt Đối (Pure Silence)</option>
                </select>
              </div>
            </div>

            <div className="pt-2">
              <div className="p-3.5 rounded-2xl bg-white/60 border border-slate-200/70 hover:bg-white/80 transition flex items-start justify-between gap-3">
                <div className="flex items-start space-x-3">
                  <div className={`w-8 h-8 rounded-xl border flex items-center justify-center mt-0.5 shrink-0 transition-colors ${shield ? 'bg-emerald-50 border-emerald-200/80 text-emerald-600' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-800">Chặn thông báo triệt để &amp; Chế độ Ẩn danh</h4>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium transition-colors ${shield ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                        {shield ? 'Đã kích hoạt' : 'Đã tắt'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed transition-colors">
                      {shield
                        ? 'Tự động tạm ẩn mạng xã hội, tin nhắn Zalo/Slack và đồng bộ trạng thái “Đang Chú Ý Sâu” cho nhóm làm việc.'
                        : 'Chế độ ẩn danh tạm dừng. Bạn vẫn có thể nhận thông báo thông thường trong phiên học.'}
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox" className="sr-only peer" checked={shield}
                    onChange={(e) => {
                      setShield(e.target.checked);
                      try { localStorage.setItem('studi_shield', e.target.checked ? 'on' : 'off'); } catch { /* bỏ qua */ }
                      showToast(e.target.checked ? '🛡️ Đã bật Chế độ Khiên Ẩn danh & Chặn thông báo triệt để.' : 'Đã cho phép thông báo trong phiên học.', 'info');
                    }}
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 shadow-inner" />
                </label>
              </div>
            </div>

            <div className="pt-1">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
                <span>Thử nhanh dải âm tự nhiên:</span>
                <Link to="/sound" className="text-brand-600 font-medium hover:underline">Tùy chỉnh EQ</Link>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                {QUICK_CHIPS.map(([key, label]) => {
                  const on = sound === key;
                  return (
                    <button
                      key={key} type="button"
                      onClick={() => { setSound(key); if (running) ensureAudio(); }}
                      className={on
                        ? 'px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 border border-brand-200/80 font-medium whitespace-nowrap flex items-center gap-1 cursor-pointer'
                        : 'px-2.5 py-1 rounded-lg bg-white/60 text-slate-600 border border-slate-200 hover:bg-white hover:text-slate-800 font-medium whitespace-nowrap cursor-pointer transition'}
                    >
                      {on && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="text-xs sm:text-sm font-semibold text-slate-700" htmlFor="session-quick-notes">Ghi chú phiên (lưu kèm khi hoàn tất)</label>
              <textarea
                id="session-quick-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="VD: Đã xong dàn ý chương 3, còn kẹt phần phương pháp..."
                className="glass-input w-full px-4 py-2.5 rounded-2xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none transition shadow-sm resize-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDistractions((d) => { showToast(`Ghi nhận xao nhãng (${d + 1}). Hít thở sâu và quay lại nhé!`, 'warning'); return d + 1; })}
                title="Bấm mỗi khi bạn bị xao nhãng"
                className="px-4 py-2.5 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-sm font-semibold border border-amber-200 transition"
              >
                📵 Xao nhãng (<span id="distraction-count">{distractions}</span>)
              </button>
              <label className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-600 cursor-pointer">
                <input type="checkbox" checked={completeNext} onChange={(e) => setCompleteNext(e.target.checked)} className="rounded" />
                Tự tick micro-sprint kế tiếp khi xong phiên
              </label>
              <label className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shield}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setShield(on);
                    try { localStorage.setItem('studi_shield', on ? 'on' : 'off'); } catch {}
                    showToast(on ? 'Đã bật khiên tập trung: ẩn viền xao nhãng.' : 'Đã tắt khiên tập trung.', 'info');
                  }}
                  className="rounded text-brand-600"
                />
                🛡️ Khiên tập trung (giảm xao nhãng)
              </label>
            </div>

            {task && subs.length > 0 && (
              <div className="pt-1">
                <p className="text-xs sm:text-sm font-semibold text-slate-700 mb-2">Micro-sprint của nhiệm vụ ({doneSubs}/{subs.length})</p>
                <div className="space-y-2">
                  {subs.map((s) => (
                    <button
                      key={s.id} type="button" onClick={() => toggleSubtask(s)}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/80 border border-slate-200/70 text-left hover:border-emerald-300 transition"
                    >
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold ${s.is_completed ? 'bg-emerald-500 text-white' : 'border border-slate-300 text-transparent'}`}>✓</span>
                      <span className={`text-xs font-medium ${s.is_completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>{s.title}</span>
                      {s.estimated_minutes != null && <span className="ml-auto text-[11px] text-slate-400">{s.estimated_minutes}p</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button" onClick={handleMainButton}
                className={`w-full sm:w-auto flex-1 order-1 sm:order-2 py-3.5 px-6 rounded-2xl text-white font-semibold text-sm sm:text-base shadow-glow-blue hover:shadow-lg transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 ${running ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600' : 'bg-gradient-to-r from-brand-600 via-blue-600 to-sky-500 hover:from-brand-700 hover:to-sky-600'}`}
              >
                <span>
                  {running ? (leg.kind === 'break' ? `Đang Nghỉ (${leg.minutes}p) — bấm để bỏ qua` : 'Đang Tập Trung (Bấm để Tạm dừng)') : ended ? '↻ Làm lại phiên mới' : 'Bắt đầu Tập trung Ngay (Deep Flow)'}
                </span>
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
              </button>
              <div className="w-full sm:w-auto order-2 sm:order-1 flex items-center justify-center sm:justify-start space-x-3 text-xs">
                <button type="button" onClick={handleSchedule} className="text-slate-600 hover:text-slate-900 font-medium underline-offset-4 hover:underline py-2">
                  Gán vào Lịch Sinh học
                </button>
                <span className="text-slate-300">•</span>
                <button type="button" onClick={handleReset} className="text-slate-400 hover:text-slate-600 font-normal py-2">
                  Khôi phục mặc định
                </button>
              </div>
            </div>
            {ended && (
              <Link to="/dashboard" className="block text-center text-xs text-brand-600 hover:underline pt-1">
                Xem tiến độ trên Dashboard →
              </Link>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}
