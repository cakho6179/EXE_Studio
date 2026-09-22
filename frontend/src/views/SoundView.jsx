import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { useToast } from '../contexts/ToastContext.jsx';
import { useAudio } from '../contexts/AudioContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

// 15 track pixel-faithful theo 18-sound-sanctuary.
// Engine Web Audio chỉ synth được ocean/rain/binaural; các track còn lại
// fallback minh bạch + toast, KHÔNG tạo Audio element mới.
const TRACKS = [
  { id: 'ocean', title: 'Sóng Biển Hải Đăng 432Hz', category: 'nature', icon: '🌊', duration: '10:00', freq: '432Hz', desc: 'Tiếng sóng rì rào bờ cát & gió biển dịu mát', engine: 'ocean', badge: 'Khuyên dùng' },
  { id: 'rain', title: 'Mưa Rơi Bên Hiên Gỗ', category: 'nature', icon: '🌧️', duration: '12:00', freq: '432Hz', desc: 'Tí tách đều đặn, phủ kín tạp âm ký túc xá', engine: 'rain', badge: 'Khử ồn tốt' },
  { id: 'forest', title: 'Gió Thông & Suối Reo Núi Cao', category: 'nature', icon: '🌲', duration: '15:00', freq: '528Hz', desc: 'Thư thái, tái khởi động não giữa 2 ca học', engine: 'binaural', badge: 'Thanh lọc', missing: 'Suối rừng (tạm dùng Alpha 528Hz)' },
  { id: 'night', title: 'Đêm Tĩnh Lặng & Côn Trùng Rừng', category: 'nature', icon: '🌙', duration: '20:00', freq: '432Hz', desc: 'Giảm kích thích ánh sáng màn hình laptop', engine: 'silence', badge: 'Ngủ sâu' },
  { id: 'brown', title: 'Tiếng Ồn Nâu Thư Thái', category: 'noise', icon: '🟤', duration: '∞', freq: 'Brown', desc: 'Che tiếng ồn hiệu quả nhất (tạm dùng Sóng Biển)', engine: 'ocean', badge: 'Focus sâu', missing: 'Brown Noise (tạm dùng Sóng Biển 432Hz)' },
  { id: 'pink', title: 'Pink Noise Cân Bằng', category: 'noise', icon: '🌸', duration: '∞', freq: 'Pink', desc: 'Cân bằng tần số, tốt cho giấc ngủ và tập trung', engine: 'ocean', missing: 'Pink Noise (tạm dùng Sóng Biển 432Hz)' },
  { id: 'white', title: 'White Noise Nhẹ', category: 'noise', icon: '⬜', duration: '∞', freq: 'White', desc: 'Che tiếng ồn văn phòng, phòng học nhóm', engine: 'rain', missing: 'White Noise (tạm dùng Mưa Rơi)' },
  { id: 'lofi', title: 'Lo-fi Stuđiô 60 BPM', category: 'music', icon: '🎧', duration: '38:12', freq: '60 BPM', desc: 'Giữ nhịp gõ phím ổn định • Không lời • Giảm xao nhãng', engine: 'ocean', missing: 'Lo-fi (tạm dùng Sóng Biển 432Hz)' },
  { id: 'piano', title: 'Dương Cầm Chiều Mưa', category: 'music', icon: '🎹', duration: '45:00', freq: '432Hz', desc: 'Mở rộng chiều sâu tư duy logic • Giai điệu tối giản', engine: 'ocean', missing: 'Piano (tạm dùng Sóng Biển 432Hz)' },
  { id: 'library', title: 'Tiếng Sách Thư Viện Cổ & Bút Chì', category: 'music', icon: '📚', duration: '52:30', freq: 'Ambient', desc: 'Âm thanh lật trang sách, gõ bàn phím cơ nhẹ nhàng', engine: 'rain', missing: 'Thư viện (tạm dùng Mưa Rơi)' },
  { id: 'alpha', title: 'Sóng Alpha 10Hz', category: 'binaural', icon: '🧠', duration: '∞', freq: '10Hz', desc: 'Kích thích sóng não alpha, thư giãn tỉnh táo', engine: 'binaural' },
  { id: 'theta', title: 'Sóng Theta 6Hz', category: 'binaural', icon: '💤', duration: '∞', freq: '6Hz', desc: 'Trạng thái thiền sâu, tốt cho sáng tạo và ngủ. Dùng tai nghe', engine: 'binaural' },
  { id: 'f528', title: 'Solfeggio 528Hz', category: 'solfeggio', icon: '✨', duration: '∞', freq: '528Hz', desc: 'Tần số chữa lành, giảm stress, tăng năng lượng tích cực', engine: 'binaural', badge: 'Tái tạo năng lượng' },
  { id: 'f396', title: 'Solfeggio 396Hz', category: 'solfeggio', icon: '🌅', duration: '∞', freq: '396Hz', desc: 'Giải phóng sợ hãi, lo âu trước kỳ thi', engine: 'ocean', badge: 'Xóa bỏ áp lực', missing: '396Hz (engine synth Alpha tương đương)' },
  { id: 'f852', title: 'Solfeggio 852Hz', category: 'solfeggio', icon: '🔮', duration: '∞', freq: '852Hz', desc: 'Đánh thức trực giác, tăng nhận thức khi ôn tập', engine: 'binaural', badge: 'Trực giác' },
];

const CATS = [
  ['all', 'Tất cả'],
  ['nature', 'Thiên nhiên'],
  ['noise', 'Noise'],
  ['music', 'Nhạc'],
  ['binaural', 'Binaural'],
  ['solfeggio', 'Solfeggio'],
];

const favKeyFor = (user) => `studi_sound_favs:${user?.id || 'guest'}`;
const getFavs = (user) => {
  try { return JSON.parse(localStorage.getItem(favKeyFor(user)) || '[]'); } catch { return []; }
};

const FREQS = [
  { label: '432 Hz', name: 'Cân bằng tự nhiên & Hạ stress', desc: 'Tần số của vũ trụ, hạ nhịp tim và Cortisol. Kích hoạt dải sóng não Alpha (8-12Hz) tối ưu cho học tập sâu.', tag: 'Đang chọn', active: true },
  { label: '528 Hz', name: 'Sửa chữa tế bào & Tập trung cao độ', desc: 'Tần số chuyển hóa sinh học kỳ diệu, gia tăng độ nhạy bén tư duy giải thuật và đồ án lập trình.', tag: 'Tái tạo năng lượng' },
  { label: '396 Hz', name: 'Giải tỏa âu lo & Áp lực thi cử', desc: 'Rung chấn trầm ấm xua tan hội chứng sợ thất bại, tạo tinh thần thoải mái trước ngày nộp đồ án.', tag: 'Xóa bỏ áp lực' },
  { label: '852 Hz', name: 'Khơi thông tư duy logic trừu tượng', desc: 'Thúc đẩy khả năng liên kết ý tưởng toán rời rạc, kiến trúc hệ thống và tổng hợp luận điểm phức tạp.', tag: 'Trực giác' },
];

export default function SoundView() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const { isPlaying, track, volume, setVolume, togglePlay, switchTrack, nextTrack, setSleepTimer, engine, ready } = useAudio();
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');
  const [favs, setFavs] = useState(() => getFavs(user));
  const [sleepMin, setSleepMin] = useState(0);
  const [sleepLeft, setSleepLeft] = useState(0);
  const [freq, setFreq] = useState('432 Hz');
  const [, setMixTick] = useState(0);
  const [breathOn, setBreathOn] = useState(false);
  const [breathText, setBreathText] = useState('Hít vào 4s • Giữ 7s • Thở nhẹ 8s');
  const [breathCount, setBreathCount] = useState('4s');
  const [breathScale, setBreathScale] = useState(1);
  const [breathDuration, setBreathDuration] = useState('4s');
  const mixerRef = useRef(null);

  const engTrackId = engine()?.currentTrackId || track.id;

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TRACKS.filter((t) =>
      (cat === 'all' || t.category === cat) &&
      (!q || [t.title, t.desc, t.freq, t.category].filter(Boolean).join(' ').toLowerCase().includes(q)),
    );
  }, [cat, query]);

  // Hẹn giờ tắt: ENGINE tắt thật (toast duy nhất từ engine); view chỉ đồng bộ hiển thị.
  // Lắng nghe event calmAudioSleep để reset countdown (tránh double-stop + double-toast).
  useEffect(() => {
    const onSleep = () => { setSleepMin(0); setSleepLeft(0); };
    document.addEventListener('calmAudioSleep', onSleep);
    return () => document.removeEventListener('calmAudioSleep', onSleep);
  }, []);
  useEffect(() => {
    if (!sleepLeft) return;
    if (sleepLeft <= 0) {
      setSleepMin(0);
      return;
    }
    const t = setTimeout(() => setSleepLeft((s) => s - 1), 60000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepLeft]);

  function setSleep(m) {
    setSleepMin(m);
    setSleepLeft(m);
    try { setSleepTimer(m); } catch { /* bỏ qua */ }
    if (m > 0) showToast(`Nhạc sẽ tắt sau ${m} phút.`, 'info');
  }

  // Track đang phát HIỂN THỊ (id trong TRACKS) — engine chỉ có 3 kênh nên không dùng
  // engine id để highlight (6 track ocean sẽ sáng cùng lúc).
  const [activeId, setActiveId] = useState(track.id);

  function playTrack(t) {
    const eng = engine();
    if (!eng) { showToast('Engine âm thanh chưa sẵn sàng.', 'warning'); return; }
    if (t.engine === 'silence') {
      if (eng.isPlaying) togglePlay();
      setActiveId(t.id);
      showToast('Đã chuyển sang Im lặng tuyệt đối.', 'info');
      return;
    }
    if (t.missing) showToast(`"${t.title}" chưa có synth offline — ${t.missing}.`, 'warning');
    if (eng.currentTrackId !== t.engine) switchTrack(t.engine);
    if (!eng.isPlaying) togglePlay();
    setActiveId(t.id);
  }

  function toggleFav(id) {
    const key = favKeyFor(user);
    setFavs((f) => {
      const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* bỏ qua */ }
      return next;
    });
  }

  const trackLevel = (key) => {
    try {
      const v = Math.round(engine()?.getTrackVolume(key) * 100);
      return Number.isFinite(v) ? v : 60;
    } catch {
      return 60;
    }
  };
  function setTrackLevel(key, v, title) {
    if (!['ocean', 'rain', 'binaural'].includes(key)) {
      if (title) showToast(`Kênh "${title}" là track độc lập — điều chỉnh qua âm lượng chính.`, 'info');
      return;
    }
    try { engine()?.setTrackVolume(key, v / 100); } catch { /* bỏ qua */ }
    setMixTick((x) => x + 1);
  }

  // Preset server (chỉ fetch khi đã đăng nhập để tránh 401 Unauthorized)
  const presetsQ = useQuery({
    queryKey: ['audio-presets'],
    queryFn: () => api.get('/audio/presets'),
    enabled: Boolean(user?.id),
    staleTime: 30000,
    retry: 1,
  });

  const myPresets = useMemo(() => {
    const serverList = Array.isArray(presetsQ.data?.presets) ? presetsQ.data.presets : [];
    try {
      const localList = JSON.parse(localStorage.getItem('studi_local_presets') || '[]');
      return [...serverList, ...(Array.isArray(localList) ? localList : [])];
    } catch {
      return serverList;
    }
  }, [presetsQ.data]);

  async function savePreset() {
    const eng = engine();
    if (!eng) return;
    const name = (window.prompt('Đặt tên cho preset phối âm hiện tại:') || '').trim();
    if (!name) return;
    const allowedTracks = ['ocean', 'rain', 'binaural'];
    const cleanLevels = {};
    if (eng.trackLevels) {
      Object.entries(eng.trackLevels).forEach(([k, v]) => {
        if (allowedTracks.includes(k) && typeof v === 'number' && !isNaN(v)) {
          cleanLevels[k] = Math.max(0, Math.min(1, v));
        }
      });
    }
    const trackToSave = allowedTracks.includes(eng.currentTrackId) ? eng.currentTrackId : 'ocean';
    try {
      if (user?.id) {
        try {
          await api.post('/audio/presets', { name, track: trackToSave, volume: eng.volume, levels: cleanLevels, spatial_on: eng.spatial !== false });
          presetsQ.refetch();
          showToast(`Đã lưu preset "${name}" lên hệ thống Stuđiô!`, 'success');
          return;
        } catch {
          // Khi lỗi mạng/server, tự động fallback lưu local dưới đây (F20)
        }
      }
      const list = JSON.parse(localStorage.getItem('studi_local_presets') || '[]');
      list.push({ id: `local_${Date.now()}`, name, track: trackToSave, volume: eng.volume, levels: cleanLevels, spatial_on: eng.spatial !== false });
      localStorage.setItem('studi_local_presets', JSON.stringify(list));
      setMixTick((x) => x + 1);
      showToast(`Đã lưu preset "${name}" trong bộ nhớ thiết bị!`, 'success');
    } catch (err) { showToast(err.message || 'Không lưu được preset.', 'error'); }
  }
  const ENGINE_TRACKS = ['ocean', 'rain', 'binaural'];
  function applyPreset(p) {
    const eng = engine();
    if (!eng) return;
    if (!ENGINE_TRACKS.includes(p.track)) {
      showToast(`Preset "${p.name}" dùng track lạ (${p.track}) — bỏ qua để tránh phát nhầm.`, 'warning');
      return;
    }
    if (p.levels) Object.entries(p.levels).forEach(([tr, lv]) => { try { eng.setTrackVolume(tr, lv); } catch {} });
    setVolume(p.volume ?? 0.65);
    try { eng.setSpatial(p.spatial_on !== false); } catch {}
    if (eng.currentTrackId !== p.track) switchTrack(p.track);
    if (!eng.isPlaying) togglePlay();
    setMixTick((x) => x + 1);
    showToast(`Đã áp preset "${p.name}".`, 'success');
  }

  // Nhịp thở 4-7-8: Hít 4s (phồng) -> Giữ 7s -> Thở 8s (xẹp), lặp lại
  useEffect(() => {
    if (!breathOn) {
      setBreathText('Hít vào 4s • Giữ 7s • Thở nhẹ 8s');
      setBreathCount('4s');
      setBreathScale(1);
      setBreathDuration('1s');
      return;
    }
    const phases = [
      { label: 'Hít vào sâu (mũi)', secs: 4, scale: 1.45, dur: '4s' },
      { label: 'Giữ hơi thở', secs: 7, scale: 1.45, dur: '7s' },
      { label: 'Thở nhẹ ra (miệng)', secs: 8, scale: 1, dur: '8s' },
    ];
    let pi = 0;
    let left = phases[0].secs;
    const paint = () => {
      setBreathText(`${phases[pi].label} — còn ${left}s`);
      setBreathCount(`${left}s`);
      setBreathScale(phases[pi].scale);
      setBreathDuration(phases[pi].dur);
    };
    paint();
    const id = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        pi = (pi + 1) % phases.length;
        left = phases[pi].secs;
        if (pi === 0) showToast('Xong 1 chu kỳ thở 4-7-8. Năng lượng ổn định hơn rồi đấy!', 'success');
      }
      paint();
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breathOn]);

  const spatial = engine()?.spatial !== false;
  const activeTrack = TRACKS.find((t) => t.id === activeId) || TRACKS.find((t) => t.engine === engTrackId && !t.missing) || TRACKS.find((t) => t.engine === engTrackId) || TRACKS[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-5 pb-28">
      <section className="flex flex-wrap items-center justify-between gap-3 text-xs bg-white/75 backdrop-blur-md p-2.5 px-4 rounded-2xl border border-white/60 shadow-xs">
        <div className="flex items-center gap-2 text-slate-600 font-medium">
          <span className="text-slate-500">📖</span>
          <span>{user?.university ? `${user.university}${user.major ? ` • ${user.major}` : ''}` : 'Học kỳ I / Năm 3 • ĐHQG TP.HCM'}</span>
          <span className="text-slate-400">/</span>
          <span className="text-slate-900 font-semibold">Không gian Âm thanh Tĩnh lặng 432Hz &amp; Tự nhiên</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-semibold">⚡ Sóng Solfeggio &amp; Nhịp sinh học v3.2</span>
          <button type="button" onClick={() => { try { engine()?.setSpatial(!(engine()?.spatial !== false)); setMixTick((x) => x + 1); showToast(engine()?.spatial !== false ? 'Đã bật vòm 3D.' : 'Đã thu hẹp vòm âm.', 'info'); } catch {} }} className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/90 text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-full font-medium transition shadow-xs">
            🎛️ Đồng bộ Tai nghe Không gian 3D
          </button>
          <button type="button" onClick={savePreset} className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium transition shadow-xs">＋ Lưu Phối Âm Yêu Thích</button>
        </div>
      </section>

      <section className="mt-6">
        <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white border border-white/20 shadow-xl" style={{ background: 'linear-gradient(to right, rgba(30,58,138,0.85), rgba(49,46,129,0.8), rgba(15,23,42,0.85))', backdropFilter: 'blur(20px)' }}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-7 space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-cyan-200 border border-white/15 text-xs font-semibold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse" />
                Calm Soundscape &amp; Neuro-Frequency Therapy
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Không gian Âm thanh Tĩnh lặng &amp; Trị liệu Thần kinh 432Hz</h1>
              <p className="text-sm text-slate-200/90 leading-relaxed max-w-2xl font-normal">
                Hòa âm tần số Solfeggio 432Hz, tiếng thì thầm của sóng biển ngọn hải đăng và thiên nhiên giúp hạ nồng độ Cortisol, kích hoạt sóng não Alpha (8-12Hz) để đưa tâm trí vào trạng thái dòng chảy (Flow State) sâu bền bỉ.
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-slate-300">
                <div className="flex items-center gap-1.5"><span className="text-emerald-400">✔</span><span>Giảm áp lực đồ án 42%</span></div>
                <div className="flex items-center gap-1.5"><span>⏱</span><span>Tối ưu cho nhịp 45 phút Pomodoro</span></div>
                <div className="flex items-center gap-1.5"><span className="text-amber-300">⚡</span><span>Sóng não Alpha 94%</span></div>
              </div>
            </div>
            <div className="lg:col-span-5 bg-white/10 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-white/20 shadow-inner">
              <div className="flex items-center justify-between pb-3 border-b border-white/15">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-end gap-1 h-6 px-1">
                    {[6, 12, 22, 10, 16].map((h, i) => (
                      <span key={i} className={`w-1 rounded-full ${isPlaying ? 'bg-cyan-400' : 'bg-slate-500'}`} style={{ height: h, animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-cyan-300 tracking-wider block">Đang phát Master</span>
                    <p className="text-xs font-semibold text-white truncate max-w-[200px]">{activeTrack.icon} {activeTrack.title}</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/30 text-cyan-200 text-[11px] font-mono border border-cyan-400/20">432Hz Pure Tone</span>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button type="button" onClick={togglePlay} aria-label={isPlaying ? 'Tạm dừng' : 'Phát'} className="relative flex items-center justify-center w-14 h-14 rounded-full bg-white/10 border border-white/20 text-white hover:scale-105 transition">
                    <span className="text-xl">{isPlaying ? '⏸' : '▶'}</span>
                  </button>
                  <div>
                    <div className="text-xl font-bold font-mono tracking-tight text-white">{sleepLeft > 0 ? `-${sleepLeft}p` : '45:00'}</div>
                    <div className="text-[11px] text-slate-300">Phiên Pomodoro tĩnh lặng</div>
                  </div>
                </div>
                <div className="space-y-1.5 text-right w-36">
                  <div className="flex justify-between text-[11px] text-slate-300"><span>Âm lượng</span><span className="font-mono text-cyan-300">{Math.round(volume * 100)}%</span></div>
                  <input className="w-full accent-cyan-400 bg-white/20 h-1.5 rounded-lg cursor-pointer" type="range" min={0} max={100} value={Math.round(volume * 100)} onChange={(e) => setVolume(Number(e.target.value) / 100)} aria-label="Âm lượng master" />
                  <div className="flex justify-between text-[10px] text-slate-400"><span>Độ mờ không gian 3D</span><span className="font-mono">{spatial ? '80%' : '20%'}</span></div>
                </div>
              </div>
              {!ready && <p className="mt-2 text-[11px] text-amber-300">Trình duyệt chưa cho phép audio — bấm Phát một lần để kích hoạt.</p>}
              <div className="mt-4 p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-400/20 flex items-start gap-2 text-xs text-cyan-100">
                <span className="text-base">🍅</span>
                <div><span className="font-semibold text-white">Khung giờ vàng 14:30 - 16:30:</span> Sóng não Alpha đạt đỉnh 94%. Đang phát phối âm tối ưu cho giải quyết bài toán phức tạp và đồ án chuyên ngành.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-8 space-y-6">
            <article className="bg-white/80 backdrop-blur-md rounded-3xl p-5 sm:p-6 border border-white/70 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">🧪 Tần Số Solfeggio &amp; Kích Hoạt Sóng Não Thần Kinh</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Tần số cộng hưởng sinh học giúp điều hòa sóng não Beta → Alpha</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 bg-blue-100/70 text-blue-700 rounded-full">Solfeggio Engine 4.0</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {FREQS.map((f) => {
                  const on = freq === f.label;
                  return (
                    <div
                      key={f.label} role="button" tabIndex={0}
                      onClick={() => { setFreq(f.label); if (!isPlaying) togglePlay(); showToast(`Tần số ${f.label}: engine hiện chỉ synth Alpha 10Hz/432Hz — đang phát nền tương đương.`, 'info'); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { setFreq(f.label); if (!isPlaying) togglePlay(); } }}
                      className={on
                        ? 'p-4 rounded-2xl border-2 border-blue-500 shadow-xs relative cursor-pointer'
                        : 'p-4 rounded-2xl bg-white/70 hover:bg-white border border-slate-200/80 shadow-xs hover:border-blue-300 transition cursor-pointer'}
                      style={on ? { background: 'linear-gradient(to bottom right, #eff6ff, rgba(238,242,255,0.6))' } : undefined}
                    >
                      {on && <div className="absolute top-3 right-3 flex items-center gap-1 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full"><span>Đang chọn</span><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /></div>}
                      <div className={`text-xl font-extrabold font-mono ${on ? 'text-blue-900' : 'text-slate-800'}`}>{f.label}</div>
                      <div className={`text-xs font-bold mt-1 ${on ? 'text-blue-700' : 'text-slate-700'}`}>{f.name}</div>
                      <p className={`text-xs mt-1.5 leading-relaxed ${on ? 'text-slate-600' : 'text-slate-500'}`}>{f.desc}</p>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="bg-white/80 backdrop-blur-md rounded-3xl p-5 sm:p-6 border border-white/70 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">🌍 Thư Viện Cảnh Quan Âm Thanh Thiên Nhiên (Soundscapes)</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Thu âm thực tế chất lượng chuẩn 96kHz/24bit không gian 3 chiều</p>
                </div>
                <span className="text-xs text-slate-500">{list.length} track • {favs.length} yêu thích</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm kiếm âm thanh…" className="sm:ml-auto px-4 py-2 rounded-xl border border-slate-200 text-xs w-full sm:w-56" />
              </div>
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Danh mục âm thanh">
                {CATS.map(([v, label]) => (
                  <button key={v} type="button" role="tab" aria-selected={cat === v} onClick={() => setCat(v)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${cat === v ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {list.map((t) => {
                  const active = activeId === t.id && (t.engine === 'silence' ? !isPlaying : isPlaying);
                  const fav = favs.includes(t.id);
                  return (
                    <div key={t.id} className="p-4 rounded-2xl bg-white/90 border border-slate-200/80 shadow-xs flex items-center gap-4 hover:border-blue-400 transition">
                      <button type="button" onClick={() => playTrack(t)} aria-label={`Phát: ${t.title}`} className="relative w-14 h-14 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 overflow-hidden border border-blue-200 hover:scale-105 transition">
                        <span className="text-2xl">{t.icon}</span>
                        <div className="absolute inset-0 bg-blue-600/10 flex items-center justify-center">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs shadow-sm">{active ? '⏸' : '▶'}</span>
                        </div>
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-xs font-bold text-slate-900 truncate">{t.title}</h3>
                          <div className="flex items-center gap-1 shrink-0">
                            {t.missing
                              ? <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium" title={t.missing}>fallback</span>
                              : t.badge && <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{t.badge}</span>}
                            <button type="button" aria-label="Yêu thích" onClick={() => toggleFav(t.id)} className={`text-base transition ${fav ? 'text-rose-500' : 'text-slate-300 hover:text-rose-400'}`}>{fav ? '♥' : '♡'}</button>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{t.desc}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="range" min={0} max={100} value={t.missing || t.engine === 'silence' ? 50 : trackLevel(t.engine)}
                            disabled={!!t.missing || t.engine === 'silence'}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setTrackLevel(t.engine, v);
                            }}
                            title={t.missing || t.engine === 'silence' ? 'Kênh dùng chung engine — chỉnh ở Bộ trộn âm bên dưới' : undefined}
                            className="w-full h-1 bg-slate-200 accent-blue-600 rounded-lg disabled:opacity-40" aria-label={`Âm lượng ${t.title}`}
                          />
                          <span className="text-[10px] font-mono text-slate-600">{t.missing || t.engine === 'silence' ? '—' : `${trackLevel(t.engine)}%`}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {list.length === 0 && <p className="text-xs text-slate-500 mt-4">Không tìm thấy âm thanh phù hợp.</p>}

              <div className="mt-6">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">🎵 Lo-fi Mộc &amp; Piano Acoustic (Chuyên Biệt Cho Sinh Viên)</h3>
                <p className="text-xs text-slate-500 mt-0.5 mb-3">Nhịp điệu đều đặn 60 BPM duy trì tốc độ gõ phím viết luận và làm bài tập lớn</p>
                <div className="space-y-2.5">
                  {TRACKS.filter((t) => t.category === 'music').map((t) => {
                    const fav = favs.includes(t.id);
                    const active = activeId === t.id && isPlaying;
                    return (
                      <div key={t.id} className="flex items-center justify-between p-3 rounded-2xl bg-white/60 hover:bg-white border border-slate-200/70 transition">
                        <div className="flex items-center gap-3 min-w-0">
                          <button type="button" onClick={() => playTrack(t)} aria-label={`Phát thử: ${t.title}`} className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs hover:bg-blue-600 hover:text-white transition shrink-0">
                            {active ? '⏸' : '▶'}
                          </button>
                          <div className="min-w-0">
                            <h3 className="text-xs font-bold text-slate-800 truncate">{t.title}</h3>
                            <span className="text-[11px] text-slate-500 truncate block">{t.desc}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-mono text-slate-500 shrink-0">
                          <span>{t.duration}</span>
                          <button type="button" onClick={() => toggleFav(t.id)} aria-label={`Yêu thích: ${t.title}`} className={`${fav ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'} text-sm transition`}>{fav ? '♥' : '♡'}</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </article>
          </section>

          <section className="lg:col-span-4 space-y-6">
            <div ref={mixerRef} className="bg-white/85 backdrop-blur-md rounded-3xl p-5 border border-white/80 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-600" /> Bộ Trộn Âm Đa Kênh (Live Mixer)</h2>
                  <span className="text-[11px] text-slate-500">Tùy biến 3 tầng âm thanh cùng lúc</span>
                </div>
                <button type="button" onClick={() => { try { engine()?.setTrackVolume('ocean', 0.85); engine()?.setTrackVolume('rain', 0.45); engine()?.setTrackVolume('binaural', 0.3); setVolume(0.65); setMixTick((x) => x + 1); } catch {} showToast('Đã khôi phục mức mixer mặc định.', 'info'); }} className="text-[11px] text-blue-600 hover:underline font-semibold">Khôi phục</button>
              </div>
              {[
                ['Kênh 1: Sóng Biển 432Hz', 'ocean', 'text-blue-500', 'text-blue-600'],
                ['Kênh 2: Mưa Rào Hải Đăng', 'rain', 'text-slate-500', 'text-slate-700'],
                ['Kênh 3: Sóng Não Alpha 528Hz', 'binaural', 'text-amber-500', 'text-amber-600'],
              ].map(([label, key, dot, pct]) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-800 flex items-center gap-1.5"><span className={dot}>●</span> {label}</span>
                    <span className={`font-mono font-semibold ${pct}`}>{`${trackLevel(key)}%`}</span>
                  </div>
                  <input
                    type="range" min={0} max={100} value={trackLevel(key)}
                    onChange={(e) => setTrackLevel(key, Number(e.target.value))}
                    className="w-full h-1.5 bg-blue-100 accent-blue-600 rounded-lg cursor-pointer" aria-label={`Mixer ${label}`}
                  />
                </div>
              ))}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">Không gian vòm 3D (Spatial)</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={spatial} onChange={(e) => { try { engine()?.setSpatial(e.target.checked); } catch {} setMixTick((x) => x + 1); showToast(e.target.checked ? 'Đã bật vòm 3D.' : 'Đã thu hẹp vòm âm.', 'info'); }} />
                  <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>
              <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100">
                <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wide">⏰ Hẹn giờ tắt (ngủ)</h3>
                <div className="mt-2 flex gap-1.5">
                  {[0, 15, 30, 60].map((m) => (
                    <button key={m} type="button" onClick={() => setSleep(m)}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition ${sleepMin === m ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 hover:bg-indigo-100'}`}>
                      {m === 0 ? 'Tắt' : `${m}p`}
                    </button>
                  ))}
                </div>
                {sleepLeft > 0 && <p className="mt-2 text-[11px] text-indigo-600">Còn {sleepLeft} phút nữa sẽ tắt.</p>}
              </div>
              <button type="button" onClick={savePreset} className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition">Lưu Thành Preset Riêng Của Bạn</button>
            </div>

            <div className="bg-white/85 backdrop-blur-md rounded-3xl p-5 border border-white/80 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">😊 Nhịp Thở Thư Giãn 4 - 7 - 8</h2>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">1 Phút Reset</span>
              </div>
              <div className="flex items-center gap-4 bg-emerald-50/70 p-3 rounded-2xl border border-emerald-100">
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-emerald-500 flex items-center justify-center text-emerald-700 font-bold text-xs transition-transform ease-in-out" style={{ transform: `scale(${breathScale})`, transitionDuration: breathDuration }}>
                  <span>{breathCount}</span>
                </div>
                <div className="text-xs space-y-0.5 flex-1">
                  <div className="font-bold text-emerald-950">{breathText}</div>
                  <p className="text-[11px] text-emerald-800/80 leading-tight">Giảm nhịp tim tức thì, xoa dịu hệ thần kinh giao cảm khi gặp lỗi code hoặc bí ý tưởng.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setBreathOn((v) => {
                        const next = !v;
                        if (!next) showToast('Đã dừng bài tập thở 4-7-8.', 'info');
                        else showToast('Bắt đầu bài thở 4-7-8: Hít sâu theo vòng tròn phồng lên...', 'success');
                        return next;
                      });
                    }}
                    className="mt-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition"
                  >
                    {breathOn ? 'Dừng bài thở' : 'Bắt đầu thở'}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white/85 backdrop-blur-md rounded-3xl p-5 border border-white/80 shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">✨ Preset Sinh Viên ĐHQG Yêu Thích</h2>
              <div className="space-y-2">
                {[
                  ['Đêm Chạy Deadline Bách Khoa', 'Mưa rào 60% + Tiếng lật sách 40%', 'rain', 0.6],
                  ['Sáng Chủ Nhật Ôn Thi Y Dược', 'Sóng biển + Suối rừng 50%', 'ocean', 0.5],
                  ['Viết Luận Văn Tối Thứ Bảy', 'Lofi 60 BPM + Quán cà phê mờ ảo', 'ocean', 0.5],
                ].map(([name, sub, tr, lv]) => (
                  <div
                    key={name} role="button" tabIndex={0}
                    onClick={() => { try { engine()?.setTrackVolume(tr, lv); if (engine()?.currentTrackId !== tr) switchTrack(tr); if (!engine()?.isPlaying) togglePlay(); } catch {} showToast(`Đã áp preset ${name}.`, 'info'); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { try { if (engine()?.currentTrackId !== tr) switchTrack(tr); if (!engine()?.isPlaying) togglePlay(); } catch {} } }}
                    className="p-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200/80 transition cursor-pointer flex justify-between items-center text-xs"
                  >
                    <div><span className="font-semibold text-slate-800 block">{name}</span><span className="text-[11px] text-slate-500">{sub}</span></div>
                    <span className="text-blue-600 font-bold">→</span>
                  </div>
                ))}
              </div>
              <div className="pt-1">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Preset của tôi</p>
                <div className="space-y-2" aria-live="polite">
                  {presetsQ.isLoading && <div className="p-2.5 text-center text-[11px] text-slate-400">Đang tải preset...</div>}
                  {presetsQ.isError && <div className="p-2.5 text-center text-[11px] text-rose-500">Không tải được preset.</div>}
                  {!presetsQ.isLoading && !presetsQ.isError && myPresets.length === 0 && <div className="p-2.5 text-center text-[11px] text-slate-400">Chưa có preset nào. Bấm &quot;+ Lưu Phối Âm&quot; ở trên.</div>}
                  {myPresets.map((p) => (
                    <div key={p.id} className="p-2.5 rounded-xl bg-blue-50/60 hover:bg-blue-50 border border-blue-100 transition flex justify-between items-center text-xs">
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-800 block truncate">{p.name}</span>
                        <span className="text-[11px] text-slate-500">{p.track} • {Math.round((p.volume ?? 0.65) * 100)}%</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => applyPreset(p)} className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold transition">Dùng</button>
                        <button
                          type="button"
                          aria-label="Xóa preset"
                          onClick={async () => {
                            if (!window.confirm('Xóa preset này?')) return;
                            if (String(p.id).startsWith('local_')) {
                              try {
                                const list = JSON.parse(localStorage.getItem('studi_local_presets') || '[]');
                                const updated = list.filter((item) => item.id !== p.id);
                                localStorage.setItem('studi_local_presets', JSON.stringify(updated));
                                setMixTick((x) => x + 1);
                                showToast('Đã xóa preset.', 'success');
                              } catch {
                                showToast('Không xóa được preset.', 'error');
                              }
                              return;
                            }
                            try {
                              await api.delete(`/audio/presets/${p.id}`);
                              presetsQ.refetch();
                              showToast('Đã xóa preset.', 'success');
                            } catch (err) {
                              showToast(err.message || 'Không xóa được.', 'error');
                            }
                          }}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="text-white rounded-3xl p-5 shadow-md relative overflow-hidden" style={{ background: 'linear-gradient(to bottom right, #312e81, #0f172a)' }}>
              <div className="flex items-center gap-2 mb-2 text-indigo-300 text-xs font-bold uppercase tracking-wider"><span className="text-base">🧬</span> Lời Khuyên Nhịp Sinh Học AI</div>
              <p className="text-xs text-slate-200 leading-relaxed">“Đừng nghe âm lượng vượt quá 65% trên tai nghe. Âm 432Hz giúp <span>{user?.full_name || 'bạn'}</span> duy trì trạng thái tập trung sâu bền bỉ khi học.”</p>
              <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between text-[11px] text-slate-300">
                <span>Mức độ tự tin sinh học: 98%</span>
                <Link to="/analytics" className="text-cyan-300 hover:underline font-medium">Chi tiết biểu đồ →</Link>
              </div>
            </div>
          </section>
        </div>
      </main>

      <aside className="fixed bottom-3 inset-x-0 z-50 max-w-5xl mx-auto px-4">
        <div className="bg-white/95 backdrop-blur-xl border border-white/80 shadow-2xl rounded-2xl p-3 px-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm relative overflow-hidden">
              <span className="text-lg">{activeTrack.icon}</span>
              <span className="absolute bottom-0 inset-x-0 h-1 bg-cyan-300" />
            </div>
            <div className="truncate leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900 truncate">{activeTrack.title}</span>
                <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-mono">{activeTrack.freq}</span>
              </div>
              <span className="text-[11px] text-slate-500 truncate block">{activeTrack.desc}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button type="button" onClick={() => { const keys = ['ocean', 'rain', 'binaural']; const cur = keys.indexOf(engTrackId); const nxt = keys[(cur - 1 + keys.length) % keys.length]; if (engine()?.currentTrackId !== nxt) switchTrack(nxt); if (!engine()?.isPlaying) togglePlay(); }} className="p-2 text-slate-500 hover:text-slate-800 transition" title="Bài trước">⏮</button>
            <button type="button" onClick={togglePlay} className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-md hover:scale-105 transition" title="Tạm dừng/Phát">
              <span className="text-sm">{isPlaying ? '⏸' : '▶'}</span>
            </button>
            <button type="button" onClick={() => nextTrack()} className="p-2 text-slate-500 hover:text-slate-800 transition" title="Bài tiếp">⏭</button>
          </div>
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <button type="button" onClick={() => mixerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition" title="Mở EQ trong Sanctuary">🎚 Cài đặt EQ</button>
            <Link to="/deepwork" className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition">Bắt đầu Pomodoro 🍅</Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
