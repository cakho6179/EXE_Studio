import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { useAudio } from '../contexts/AudioContext.jsx';
import { api } from '../services/api.js';
import LmsSyncModal from '../components/LmsSyncModal.jsx';

// Gộp 07-onboarding-major + 08-onboarding-goals + 09-onboarding-circadian
// thành wizard 4 bước: ngành học → mục tiêu → khung giờ vàng → nhịp sinh học.

const MAJORS = [
  { name: 'Lập trình & Kỹ thuật', sub: 'Coding & Software Tech', emoji: '💻' },
  { name: 'Thiết kế & Sáng tạo', sub: 'Design & UI/UX', emoji: '🎨' },
  { name: 'Ngôn ngữ & Ngoại ngữ', sub: 'IELTS, TOEIC & Giao tiếp', emoji: '🗣️' },
  { name: 'Nghiên cứu & Đồ án', sub: 'Khoa học & Luận văn', emoji: '🔬' },
  { name: 'Kinh tế & Tài chính', sub: 'Business & Finance', emoji: '📊' },
  { name: 'Y dược & Sức khỏe', sub: 'Medical & Life Sciences', emoji: '⚕️' },
  { name: 'Luật & Khoa học xã hội', sub: 'Law & Humanities', emoji: '⚖️' },
  { name: 'Ôn thi & Chứng chỉ', sub: 'Kỳ thi chuyên ngành', emoji: '📚' },
  { name: 'Tự học & Phát triển bản thân', sub: 'Kỹ năng mềm, tư duy phản biện & phong cách sống tập trung', emoji: '✨', span: true },
];

const GOALS = [
  { value: '2h', hours: 2, title: '2 giờ / ngày', sub: 'Khởi động nhẹ nhàng', desc: 'Duy trì thói quen ôn tập hàng ngày' },
  { value: '4.5h', hours: 4.5, title: '4.5 giờ', per: '/ ngày', sub: '3 Chu kỳ 90 phút vàng', desc: 'Tối ưu hóa khả năng ghi nhớ & chống quá tải', badge: 'Khuyến nghị AI' },
  { value: '6h', hours: 6, title: '6+ giờ / ngày', sub: 'Chuyên sâu Đồ án', desc: 'Giai đoạn nước rút thi cử hoặc khóa luận' },
];

const SLOTS = [
  { value: 'morning', emoji: '🌅', title: 'Sáng sớm', time: '06:00 – 09:00', desc: 'Đón bình minh trong trẻo' },
  { value: 'afternoon', emoji: '🌊', title: 'Chiều đỉnh cao', time: '14:00 – 17:00', desc: 'Sóng não Alpha 10Hz lý tưởng' },
  { value: 'night', emoji: '🌙', title: 'Đêm tĩnh mịch', time: '20:00 – 23:30', desc: 'Deep Flow không xao nhãng' },
];

const SYNC_SERVICES = [
  { name: 'Canvas LMS', icon: '🔴', provider: 'canvas' },
  { name: 'Google Classroom', icon: '🟢', provider: 'classroom' },
  { name: 'Microsoft Teams', icon: '🟣', provider: 'teams' },
];

const CHRONOTYPES = [
  { value: 'lark', emoji: '🌅', title: 'Chim Sơn Ca', desc: 'Tỉnh táo buổi sáng (06:00 – 23:00)' },
  { value: 'owl', emoji: '🦉', title: 'Cú Đêm', desc: 'Đỉnh cao buổi tối (09:00 – 01:00)' },
  { value: 'hummingbird', emoji: '🐦', title: 'Chim Ruồi', desc: 'Linh hoạt cả ngày (07:30 – 23:30)' },
];

const INTENSITIES = [
  { value: 'relaxed', emoji: '🌱', title: 'Dưỡng Khí & Bền Bỉ', plan: '25m học • 10m nghỉ', wave: 'Sóng Alpha 10Hz thư thái', dot: 'bg-emerald-400' },
  { value: 'balanced', emoji: '🌊', title: 'Nhịp Độ Cân Bằng', plan: '50m học • 10m nghỉ', wave: 'Sóng biển & Mưa nhẹ 432Hz', dot: 'bg-blue-500', badge: 'Đề xuất' },
  { value: 'deep', emoji: '⚡', title: 'Tập Trung Cao Độ', plan: '90m học • 15m nghỉ', wave: 'Tiếng ồn Nâu & Lofi 60 BPM', dot: 'bg-indigo-400' },
  { value: 'sprint', emoji: '🎯', title: 'Chạy Nước Rút', plan: 'Tối đa tập trung ngắn hạn', wave: 'Cảnh báo mắt 20-20-20', dot: 'bg-amber-500' },
];

const STEPS = [
  { id: 1, tag: '07', title: 'Lĩnh vực', full: 'Định hình Lĩnh vực Học tập' },
  { id: 2, tag: '08', title: 'Mục tiêu ngày', full: 'Mục tiêu Giờ học Hằng ngày' },
  { id: 3, tag: '08', title: 'Khung giờ & LMS', full: 'Khung Giờ Vàng & Đồng Bộ LMS' },
  { id: 4, tag: '09', title: 'Nhịp sinh học', full: 'Cân Bằng Nhịp Sinh Học & Sóng Não' },
];
const CIRC = 2 * Math.PI * 66;

function selectedCardClass(on) {
  return on
    ? 'cursor-pointer group relative flex items-center justify-between p-3.5 rounded-xl border bg-blue-50/90 border-blue-400 text-blue-900 shadow-sm transition-all duration-200'
    : 'cursor-pointer group relative flex items-center justify-between p-3.5 rounded-xl border border-white/80 bg-white/60 hover:bg-white/95 hover:border-blue-200 hover:shadow-sm text-slate-700 transition-all duration-200';
}

export default function OnboardingView() {
  const { refreshUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [majors, setMajors] = useState([MAJORS[0].name, MAJORS[1].name]);
  const [goal, setGoal] = useState('4.5h');
  const [slot, setSlot] = useState('afternoon');
  const [chronotype, setChronotype] = useState('lark');
  const [hours, setHours] = useState(4.5);
  const [intensity, setIntensity] = useState('balanced');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [showLmsModal, setShowLmsModal] = useState(false);
  const [selectedLmsProvider, setSelectedLmsProvider] = useState('canvas');

  const { isPlaying, togglePlay } = useAudio();

  function toggleMajor(name) {
    setMajors((prev) => (prev.includes(name) ? prev.filter((m) => m !== name) : [...prev, name]));
  }

  function handleKeyToggle(e, fn) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  }

  async function next() {
    if (step === 1 && majors.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 lĩnh vực để AI gợi ý lộ trình.', 'warning');
      return;
    }
    // Lưu trung gian từng bước (F05)
    try {
      if (step === 1 && majors.length > 0) {
        await api.put('/auth/profile', { major: majors[0] });
      } else if (step === 2) {
        const goalObj = GOALS.find((g) => g.value === goal) || GOALS[1];
        await api.put('/auth/profile', { target_daily_focus_hours: goalObj.hours });
      } else if (step === 3) {
        await api.put('/auth/profile', { preferred_study_style: slot === 'afternoon' ? 'pomodoro' : slot === 'night' ? 'deep_work' : 'sprint' });
      }
    } catch {
      // bỏ qua lỗi mạng ở bước trung gian
    }
    if (step < 4) setStep(step + 1);
  }

  function resetCircadian() {
    setHours(4.5);
    setIntensity('balanced');
    showToast('Đã khôi phục mức khuyến nghị sinh học (4.5h/ngày, Nhịp Độ Cân Bằng)', 'info');
  }

  async function finish(useDefaults = false) {
    const goalObj = GOALS.find((g) => g.value === goal) || GOALS[1];
    const answers = useDefaults
      ? { majors: [MAJORS[0].name], major: MAJORS[0].name, daily_goal: '4.5h', focus_hours: 4.5, circadian_slot: 'afternoon', chronotype: 'lark', intensity: 'balanced' }
      : {
          majors,
          major: majors[0],
          daily_goal: goal,
          focus_hours: goalObj.hours,
          target_hours: hours,
          circadian_slot: slot,
          chronotype,
          intensity,
        };
    setSaving(true);
    try {
      // Spec: POST /onboarding/complete {answers} (backend đã có route thật).
      // Fallback PUT /auth/profile nếu server cũ chưa có route onboarding.
      try {
        await api.post('/onboarding/complete', { answers });
      } catch (err) {
        const styleMap = { relaxed: 'pomodoro', balanced: 'pomodoro', deep: 'deep_work', sprint: 'sprint' };
        await api.put('/auth/profile', {
          major: answers.major,
          chronotype: answers.chronotype,
          wake_up_time: answers.chronotype === 'owl' ? '09:00' : answers.chronotype === 'hummingbird' ? '07:30' : '06:30',
          bed_time: answers.chronotype === 'owl' ? '01:00' : answers.chronotype === 'hummingbird' ? '23:30' : '23:00',
          target_daily_focus_hours: answers.target_hours ?? answers.focus_hours,
          target_gpa: 3.8,
          preferred_study_style: styleMap[answers.intensity] || 'pomodoro',
        });
      }
      localStorage.setItem('studi_onboarded', 'true');
      try {
        await refreshUser();
      } catch {
        /* giữ cache local, vẫn điều hướng */
      }
      setDone(true);
      showToast(`Đã lưu nhịp sinh học (${answers.target_hours ?? answers.focus_hours}h/ngày, ${answers.intensity})! Chào mừng vào Không gian học tập.`, 'success');
      setTimeout(() => navigate('/dashboard', { replace: true }), 500);
    } catch (err) {
      showToast(err.message || 'Không lưu được.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const dialOffset = CIRC - (Math.min(Math.max(hours / 8, 0.1), 1) * CIRC);

  return (
    <div className="min-h-screen font-sans text-slate-800 antialiased relative flex flex-col justify-between selection:bg-blue-100 selection:text-blue-900 pb-8">
      <style>{`
        .glass-panel { background: rgba(255,255,255,0.92); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,0.85); }
        input[type=range].calm-slider { -webkit-appearance: none; width: 100%; background: transparent; }
        input[type=range].calm-slider:focus { outline: none; }
        input[type=range].calm-slider::-webkit-slider-runnable-track { width: 100%; height: 10px; cursor: pointer; background: #e2e8f0; border-radius: 9999px; border: none; }
        input[type=range].calm-slider::-webkit-slider-thumb { height: 26px; width: 26px; border-radius: 50%; background: #2563eb; cursor: grab; -webkit-appearance: none; margin-top: -8px; box-shadow: 0 0 0 4px rgba(255,255,255,0.95), 0 4px 10px rgba(37,99,235,0.4); }
        input[type=range].calm-slider::-moz-range-track { width: 100%; height: 10px; cursor: pointer; background: #e2e8f0; border-radius: 9999px; }
        input[type=range].calm-slider::-moz-range-thumb { height: 26px; width: 26px; border-radius: 50%; background: #2563eb; border: 4px solid #ffffff; box-shadow: 0 4px 10px rgba(37,99,235,0.4); }
      `}</style>

      {/* Background Scenery: Ngọn hải đăng bình yên hoàng hôn */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" data-purpose="background-scenery">
        <img
          alt="Khung cảnh màu nước ngọn hải đăng bình yên"
          className="w-full h-full object-cover object-center filter brightness-[1.02] contrast-[0.98] scale-[1.01]"
          src="/assets/images/lighthouse-wide.png"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-slate-900/25" />
        <div className="absolute inset-0 backdrop-blur-[1.5px]" />
      </div>

      {/* Top Floating Calm Header */}
      <header className="relative z-20 w-full max-w-4xl mx-auto px-4 sm:px-6 pt-5 pb-2 flex justify-between items-center text-xs">
        <div className="flex items-center gap-2 bg-white/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/80 shadow-sm text-slate-700 font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span>Chế độ tập trung tĩnh lặng</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500 tracking-wider text-[10px] uppercase font-semibold">CALM MODE ON</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            className="flex items-center gap-2 bg-white/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/80 shadow-sm text-slate-700 hover:text-blue-600 transition-all cursor-pointer"
            title="Bật/Tắt âm thanh kích thích sóng não 432Hz"
          >
            <span className="text-blue-600">{isPlaying ? '🔊' : '🔈'}</span>
            <span className="font-medium hidden sm:inline">{isPlaying ? 'Nhạc 432Hz (Đang phát)' : 'Bật nhạc 432Hz'}</span>
          </button>
        </div>
      </header>

      {/* Center Onboarding Card */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="glass-panel w-full max-w-2xl rounded-3xl shadow-2xl p-6 sm:p-8 flex flex-col my-auto transition-all relative">
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/95 p-1.5 shadow-md border border-blue-50 flex items-center justify-center mb-3">
              <img alt="Logo Stuđiô AI" className="w-full h-full object-contain rounded-xl" src="/assets/images/logo.png" />
            </div>
            <div className="inline-flex items-center space-x-1.5 bg-blue-50/90 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full border border-blue-200/60 mb-2 tracking-wide uppercase">
              <span>Stuđiô AI</span>
              <span>•</span>
              <span>Thiết Lập 07, 08, 09</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Cá nhân hóa không gian học tập
            </h1>
            <p className="text-slate-600 text-xs sm:text-sm mt-1 max-w-lg leading-relaxed">
              Thiết lập lĩnh vực, mục tiêu học tập hằng ngày và nhịp sinh học theo chuẩn 07, 08, 09 trước khi vào Trang chủ.
            </p>
          </div>

          {/* Stepper Navigation Indicator */}
          <div className="mt-6 mb-7" data-purpose="step-indicator">
            <div className="grid grid-cols-4 gap-2 text-center text-xs font-medium pb-2 text-slate-500">
              {STEPS.map((item, i) => {
                const n = i + 1;
                const active = n === step;
                const past = n < step;
                return (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => (n < step ? setStep(n) : null)}
                    className={`${active || past ? 'text-blue-600 font-semibold' : ''} flex flex-col sm:flex-row items-center justify-center gap-1.5 hover:opacity-80 transition cursor-pointer`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full text-[10px] font-bold inline-flex items-center justify-center transition-all ${
                        active
                          ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-200'
                          : past
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {item.tag}
                    </span>
                    <span className="hidden sm:inline text-[11px] truncate">{item.title}</span>
                  </button>
                );
              })}
            </div>
            <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden flex">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-500 ease-out shadow-sm shadow-blue-500/50"
                style={{ width: `${(step / 4) * 100}%` }}
              />
            </div>
          </div>

        {/* BƯỚC 1: ngành học (07) */}
        {step === 1 && (
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                <span>Bạn muốn tập trung vào lĩnh vực nào?</span>
              </label>
              <span className="text-xs text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/50">
                {majors.length > 0 ? `Đã chọn ${majors.length}` : 'Chưa chọn'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {MAJORS.map((m) => {
                const on = majors.includes(m.name);
                return (
                  <div
                    key={m.name}
                    role="checkbox"
                    aria-checked={on}
                    aria-label={m.name}
                    tabIndex={0}
                    onClick={() => toggleMajor(m.name)}
                    onKeyDown={(e) => handleKeyToggle(e, () => toggleMajor(m.name))}
                    className={`${selectedCardClass(on)}${m.span ? ' sm:col-span-2' : ''}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{m.emoji}</span>
                      <div>
                        <p className="text-xs font-semibold leading-snug">{m.name}</p>
                        <p className={`text-[10px] font-medium ${on ? 'text-blue-600' : 'text-slate-400'}`}>{m.sub}</p>
                      </div>
                    </div>
                    {on ? (
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
                        </svg>
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full border border-slate-300 bg-white group-hover:border-blue-300 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 text-amber-900 flex items-start gap-2.5 text-xs">
              <span className="text-base shrink-0">💡</span>
              <p className="text-[11px] leading-relaxed text-amber-800/90 font-medium">
                <strong className="font-semibold text-amber-900">Mẹo:</strong> Bạn có thể chọn nhiều lĩnh vực và tùy ý chỉnh sửa lại bất kỳ lúc nào trong phần Cài đặt không gian.
              </p>
            </div>
          </section>
        )}

        {/* BƯỚC 2: mục tiêu ngày (08) */}
        {step === 2 && (
          <section>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center space-x-1.5 mb-2.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              <span>Mục tiêu thời gian mỗi ngày (Daily Study Target)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {GOALS.map((g) => {
                const on = goal === g.value;
                return (
                  <div
                    key={g.value}
                    role="radio"
                    aria-checked={on}
                    tabIndex={0}
                    onClick={() => setGoal(g.value)}
                    onKeyDown={(e) => handleKeyToggle(e, () => setGoal(g.value))}
                    className={on
                      ? 'p-3.5 rounded-2xl border-2 border-blue-600 bg-blue-50/70 shadow-sm cursor-pointer transition text-left relative flex flex-col justify-between ring-1 ring-blue-500/20'
                      : 'p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50/80 cursor-pointer transition text-left flex flex-col justify-between'}
                  >
                    {g.badge && (
                      <span className="absolute -top-2.5 right-3 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                        {g.badge}
                      </span>
                    )}
                    <div>
                      <div className="flex items-baseline space-x-1">
                        <span className={on ? 'text-xl font-extrabold text-blue-700' : 'text-lg font-bold text-slate-800'}>{g.title}</span>
                        {g.per && <span className="text-xs font-semibold text-blue-600">{g.per}</span>}
                      </div>
                      <p className={on ? 'text-xs font-bold text-blue-800 mt-0.5' : 'text-xs font-semibold text-slate-500 mt-0.5'}>{g.sub}</p>
                    </div>
                    <p className={on ? 'text-[11px] text-blue-600/90 mt-2 font-medium' : 'text-[11px] text-slate-400 mt-2'}>{g.desc}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* BƯỚC 3: khung giờ vàng + đồng bộ lịch (08) */}
        {step === 3 && (
          <section className="space-y-6">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center space-x-1.5 mb-2.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                <span>Khung giờ vàng sinh học bạn tập trung tốt nhất</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {SLOTS.map((s) => {
                  const on = slot === s.value;
                  return (
                    <div
                      key={s.value}
                      role="radio"
                      aria-checked={on}
                      tabIndex={0}
                      onClick={() => setSlot(s.value)}
                      onKeyDown={(e) => handleKeyToggle(e, () => setSlot(s.value))}
                      className={on
                        ? 'p-3 rounded-2xl border-2 border-blue-600 bg-blue-50/60 shadow-sm cursor-pointer transition relative'
                        : 'p-3 rounded-2xl border border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50/80 cursor-pointer transition relative'}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-base">{s.emoji}</span>
                          <h4 className={`text-xs font-bold ${on ? 'text-blue-900' : 'text-slate-800'}`}>{s.title}</h4>
                        </div>
                        {on ? (
                          <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] transition">✓</span>
                        ) : (
                          <span className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[10px] transition" />
                        )}
                      </div>
                      <p className={`text-xs mt-1 ${on ? 'text-blue-700 font-bold' : 'text-blue-600 font-semibold'}`}>{s.time}</p>
                      <p className={`text-[11px] mt-0.5 ${on ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>{s.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-white/85 border border-slate-200/90 rounded-2xl p-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                    <span>🗓️</span>
                    <span>Sẵn sàng đồng bộ Thời khóa biểu đại học</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">Stuđiô AI tự động xếp lịch học trống theo tuần môn học của trường</p>
                </div>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full inline-flex self-start sm:self-auto items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  <span>1-Click Auto Sync</span>
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {SYNC_SERVICES.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => {
                      setSelectedLmsProvider(s.provider || 'canvas');
                      setShowLmsModal(true);
                    }}
                    className="flex items-center justify-center space-x-2 p-2.5 rounded-xl bg-slate-50 hover:bg-white border border-slate-200 hover:border-blue-400 transition-all text-slate-700 text-xs font-medium active:scale-95 cursor-pointer shadow-xs"
                    title={`Đồng bộ bài tập từ ${s.name}`}
                  >
                    <span className="text-xs flex-shrink-0">{s.icon}</span>
                    <span className="truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* BƯỚC 4: chronotype + giờ giấc + intensity (09) */}
        {step === 4 && (
          <section className="space-y-7">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-5 flex flex-col items-center justify-center p-4 bg-gradient-to-b from-blue-50/70 to-indigo-50/30 rounded-3xl border border-blue-100/70 relative">
                <div className="relative w-48 h-48 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
                    <circle cx="80" cy="80" fill="none" r="66" stroke="#e2e8f0" strokeWidth="12" />
                    <defs>
                      <linearGradient id="dialGradient" x1="0%" x2="100%" y1="0%" y2="100%">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="60%" stopColor="#2563eb" />
                        <stop offset="100%" stopColor="#1d4ed8" />
                      </linearGradient>
                    </defs>
                    <circle cx="80" cy="80" fill="none" r="66" stroke="url(#dialGradient)" strokeDasharray={CIRC} strokeDashoffset={dialOffset} strokeLinecap="round" strokeWidth="12" className="transition-all duration-300 ease-out" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                    <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{hours}<span className="text-lg font-semibold text-blue-600 ml-0.5">h</span></span>
                    <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide mt-0.5">mỗi ngày</span>
                    <span className="inline-flex items-center text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full mt-1 border border-emerald-200">
                      ● Tối ưu sinh học
                    </span>
                  </div>
                </div>
                <div className="text-center mt-3 w-full">
                  <p className="text-xs font-semibold text-slate-800">Nhịp độ cân bằng lý tưởng</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">3 hiệp Pomodoro sâu (90p) + 2 hiệp ôn tập nhẹ (45p)</p>
                </div>
              </div>
              <div className="lg:col-span-7 space-y-6">
                <div className="space-y-3 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-900 flex items-center gap-2" htmlFor="hours-range">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                      </svg>
                      Thời lượng học mục tiêu hằng ngày
                    </label>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 font-mono">{hours} giờ / ngày</span>
                  </div>
                  <div className="relative pt-2 pb-1">
                    <input aria-label="Điều chỉnh số giờ học" className="calm-slider" id="hours-range" max="8" min="1" step="0.5" type="range" value={hours} onChange={(e) => setHours(parseFloat(e.target.value))} />
                  </div>
                  <div className="grid grid-cols-4 text-[11px] text-slate-400 font-medium text-center pt-1">
                    <div className="text-left"><span className="block text-slate-600 font-semibold">1 - 2 giờ</span><span className="text-[10px]">Nhẹ nhàng</span></div>
                    <div className="text-center"><span className="block text-blue-600 font-bold">4 - 5 giờ</span><span className="text-[10px] text-blue-500">Khuyến nghị AI</span></div>
                    <div className="text-center"><span className="block text-slate-600 font-semibold">6 giờ</span><span className="text-[10px]">Chuyên sâu</span></div>
                    <div className="text-right"><span className="block text-amber-600 font-semibold">7 - 8+ giờ</span><span className="text-[10px]">Chạy nước rút</span></div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs px-2 text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                      <path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd" />
                    </svg>
                    Tự động chèn 10 phút nghỉ thư giãn mắt giữa các chặng
                  </span>
                  <span className="text-slate-400">Đạt chuẩn 90m Ultradian</span>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight mb-3.5">
                <span>Bạn thuộc tuýp sinh học nào?</span>{' '}
                <span className="text-xs font-normal text-slate-400">(AI dùng để tính khung giờ vàng riêng cho bạn)</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Tuýp nhịp sinh học">
                {CHRONOTYPES.map((c) => {
                  const on = chronotype === c.value;
                  return (
                    <label key={c.value} className={`relative flex items-center gap-3 p-4 rounded-2xl border-2 transition-all cursor-pointer ${on ? 'border-blue-600 bg-blue-50/50 shadow-sm' : 'border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'}`}>
                      <input className="sr-only" name="chronotype-mode" type="radio" value={c.value} checked={on} onChange={() => setChronotype(c.value)} />
                      <span className="text-2xl">{c.emoji}</span>
                      <span>
                        <span className={`font-bold text-sm block ${on ? 'text-blue-900' : 'text-slate-800'}`}>{c.title}</span>
                        <span className={`text-[11px] ${on ? 'text-blue-700' : 'text-slate-500'}`}>{c.desc}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3.5">
                <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <span>Mức độ Cường độ & Tần số Sóng não</span>
                  <span className="text-xs font-normal text-slate-400">(Chọn nhịp học phù hợp với giai đoạn của bạn)</span>
                </h2>
                <Link to="/sound" className="text-[11px] text-blue-600 font-medium cursor-pointer hover:underline">Tìm hiểu tần số 432Hz</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {INTENSITIES.map((m) => {
                  const on = intensity === m.value;
                  return (
                    <label key={m.value} className={`relative flex flex-col p-4 rounded-2xl border-2 transition-all cursor-pointer ${on ? 'border-blue-600 bg-blue-50/50 shadow-sm' : 'border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 group'}`}>
                      <input className="sr-only" name="intensity-mode" type="radio" value={m.value} checked={on} onChange={() => setIntensity(m.value)} />
                      <div className="flex items-center justify-between">
                        <span className="text-xl">{m.emoji}</span>
                        {on ? (
                          <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold">✓</span>
                        ) : (
                          <span className="w-4 h-4 rounded-full border border-slate-300 group-hover:border-blue-400 flex items-center justify-center" />
                        )}
                      </div>
                      <span className={`font-bold text-sm mt-2 flex items-center gap-1.5 ${on ? 'text-blue-900' : 'text-slate-800'}`}>
                        {m.title}
                        {m.badge && <span className="text-[9px] font-bold bg-blue-200 text-blue-800 px-1.5 py-0.2 rounded uppercase">{m.badge}</span>}
                      </span>
                      <p className={`text-[11px] mt-1 leading-snug ${on ? 'text-blue-700' : 'text-slate-500'}`}>{m.plan}</p>
                      <div className={`mt-2.5 pt-2 border-t text-[10px] flex items-center gap-1 ${on ? 'border-blue-100 text-blue-800' : 'border-slate-100 text-slate-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                        {m.wave}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/70 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                    <span>Dự báo Khung Giờ Học Vàng (Circadian Peak)</span>
                    <span className="text-[10px] font-medium bg-amber-200/80 text-amber-800 px-1.5 py-0.5 rounded">AI Sinh Học</span>
                  </h3>
                  <p className="text-xs text-amber-800/90 mt-0.5">
                    Độ minh mẫn của bạn cao nhất vào <strong className="font-semibold text-amber-950">08:30 – 11:30</strong> và <strong className="font-semibold text-amber-950">14:30 – 16:30</strong>. Stuđiô AI sẽ ưu tiên các môn cần tư duy logic vào 2 khung này.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 self-end md:self-center px-3 py-1.5 bg-white/80 rounded-xl border border-amber-200 text-[11px] font-semibold text-amber-800 whitespace-nowrap">
                <span>Năng lượng:</span>
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                <span>94% Tối ưu</span>
              </div>
            </div>
          </section>
        )}

        <div className="mt-6 pt-4 border-t border-slate-200/70 flex flex-col sm:flex-row items-center justify-between gap-3">
          {step < 4 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(4, s + 1))}
                disabled={saving}
                className="text-xs font-semibold text-slate-500 hover:text-blue-600 transition py-2 px-2 hover:underline cursor-pointer disabled:opacity-40"
              >
                Bỏ qua bước này →
              </button>
              <span className="text-slate-300">•</span>
              <button
                type="button"
                onClick={() => finish(true)}
                disabled={saving}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition py-2 px-2 hover:underline cursor-pointer disabled:opacity-40"
              >
                Dùng mặc định AI
              </button>
            </div>
          ) : (
            <button type="button" onClick={resetCircadian} className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-3 py-2.5 rounded-xl transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer">
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
              Khôi phục mặc định
            </button>
          )}
          <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1 || saving}
              className="text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-200 px-4 py-2.5 rounded-xl transition shadow-sm cursor-pointer disabled:opacity-40"
            >
              Quay lại
            </button>
            {step < 4 ? (
              <button
                type="button"
                onClick={next}
                className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs sm:text-sm px-6 py-2.5 rounded-xl shadow-md hover:shadow-lg shadow-blue-500/25 transition cursor-pointer"
              >
                <span>Tiếp tục</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => finish(false)}
                disabled={saving || done}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl text-white font-medium text-sm shadow-md transition-all duration-200 cursor-pointer disabled:opacity-70 ${done ? 'bg-emerald-600' : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'}`}
              >
                {saving ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" fill="currentColor" />
                    </svg>
                    <span>Đang hoàn tất thiết lập...</span>
                  </>
                ) : done ? (
                  <span>Đã hoàn tất! Đang chuyển tới Dashboard...</span>
                ) : (
                  <>
                    <span>Áp dụng vào Lịch trình Stuđiô</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                    </svg>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <p className="text-[11px] text-center text-slate-400 mt-4 leading-relaxed">
          🔒 Cam kết bảo mật dữ liệu học tập theo chuẩn FERPA &amp; GDPR. Dữ liệu nhịp sinh học được lưu trữ an toàn và chỉ sử dụng để tối ưu lịch trình cá nhân của bạn.
        </p>
      </div>
    </main>

      <LmsSyncModal
        isOpen={showLmsModal}
        initialProvider={selectedLmsProvider}
        onClose={() => setShowLmsModal(false)}
      />
    </div>
  );
}
