/**
 * Stuđiô AI - Calm Sound Sanctuary & 432Hz Alpha Waves Synthesizer
 * Built using Web Audio API for 100% offline, zero-asset, high-fidelity soundscapes
 * Features Persistent Floating Audio Bar across all workspace pages.
 */
const CALM_TRACKS = {
  ocean: {
    id: 'ocean',
    title: 'Sóng Biển 432Hz',
    subtitle: 'Sóng não Alpha 10Hz • Kích hoạt tập trung',
    icon: '🌊'
  },
  rain: {
    id: 'rain',
    title: 'Mưa Rào Hải Đăng',
    subtitle: 'Mưa rơi êm dịu • Giảm lo âu học thuật',
    icon: '🌧️'
  },
  binaural: {
    id: 'binaural',
    title: 'Sóng Alpha 528Hz',
    subtitle: 'Tần số Solfeggio • Tái tạo năng lượng',
    icon: '🧠'
  }
};

class CalmAudioEngine {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.masterGain = null;
    this.oscillators = [];
    this.noiseNode = null;
    // Đọc pref trong try/catch: file:// hoặc chặn cookie có thể ném SecurityError
    let track = null, vol = null, spatial = null;
    try {
      track = localStorage.getItem('studi_audio_track');
      vol = localStorage.getItem('studi_audio_volume');
      spatial = localStorage.getItem('studi_spatial');
    } catch {}
    this.currentTrackId = track || 'ocean';
    this.volume = parseFloat(vol || '0.65');
    if (isNaN(this.volume)) this.volume = 0.65;
    this.spatial = spatial !== 'off';
    this._panners = []; // cặp panner L/R để chỉnh độ rộng vòm
  }

  // Bật/tắt vòm 3D: rộng (±0.8) hoặc hẹp (±0.2), áp dụng live
  setSpatial(on) {
    this.spatial = !!on;
    try { localStorage.setItem('studi_spatial', this.spatial ? 'on' : 'off'); } catch {}
    const w = this.spatial ? 0.8 : 0.2;
    (this._panners || []).forEach(([pl, pr]) => {
      try {
        pl.pan.setValueAtTime(-w, this.ctx.currentTime);
        pr.pan.setValueAtTime(w, this.ctx.currentTime);
      } catch {}
    });
  }

  _panWidth() {
    return this.spatial ? 0.8 : 0.2;
  }

  initContext() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      // Bus riêng theo track để mixer chỉnh từng kênh live
      this.trackBus = this.ctx.createGain();
      this.trackBus.gain.setValueAtTime(1, this.ctx.currentTime);
      this.trackBus.connect(this.masterGain);
      this.trackLevels = JSON.parse(localStorage.getItem('studi_track_levels') || '{"ocean":0.85,"rain":0.45,"binaural":0.3}');
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    // Áp level đã lưu cho track hiện tại
    if (this.trackBus && this.trackLevels && this.trackLevels[this.currentTrackId] != null) {
      this.trackBus.gain.setValueAtTime(this.trackLevels[this.currentTrackId], this.ctx.currentTime);
    }
  }

  setTrackVolume(trackId, val) {
    const v = Math.max(0, Math.min(1, val));
    this.trackLevels = this.trackLevels || {};
    this.trackLevels[trackId] = v;
    try { localStorage.setItem('studi_track_levels', JSON.stringify(this.trackLevels)); } catch {}
    if (this.ctx && this.trackBus && this.isPlaying && trackId === this.currentTrackId) {
      this.trackBus.gain.setValueAtTime(v, this.ctx.currentTime);
    }
  }

  getTrackVolume(trackId) {
    return (this.trackLevels && this.trackLevels[trackId] != null) ? this.trackLevels[trackId] : 0.6;
  }

  getCurrentTrack() {
    return CALM_TRACKS[this.currentTrackId] || CALM_TRACKS.ocean;
  }

  playCurrentTrack() {
    this.stopAll();
    this.initContext();

    if (this.currentTrackId === 'rain') {
      this.startRainSound();
    } else if (this.currentTrackId === 'binaural') {
      this.startBinaural528Hz();
    } else {
      this.startOcean432Hz();
    }

    this.isPlaying = true;
    localStorage.setItem('studi_audio_playing', 'true');
    localStorage.setItem('studi_audio_track', this.currentTrackId);
    this.updateUIState();
  }

  startOcean432Hz() {
    // 432Hz carrier wave
    const oscLeft = this.ctx.createOscillator();
    const oscRight = this.ctx.createOscillator();
    const pannerLeft = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    const pannerRight = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

    // Carrier frequency: 432Hz
    // Binaural beat: 10Hz (Alpha wave state for relaxed focus)
    oscLeft.frequency.setValueAtTime(432, this.ctx.currentTime);
    oscRight.frequency.setValueAtTime(442, this.ctx.currentTime);

    const gainLeft = this.ctx.createGain();
    const gainRight = this.ctx.createGain();
    gainLeft.gain.setValueAtTime(0.07, this.ctx.currentTime);
    gainRight.gain.setValueAtTime(0.07, this.ctx.currentTime);

    if (pannerLeft && pannerRight) {
      const w = this._panWidth();
      pannerLeft.pan.setValueAtTime(-w, this.ctx.currentTime);
      pannerRight.pan.setValueAtTime(w, this.ctx.currentTime);
      this._panners.push([pannerLeft, pannerRight]);
      oscLeft.connect(gainLeft).connect(pannerLeft).connect(this.trackBus);
      oscRight.connect(gainRight).connect(pannerRight).connect(this.trackBus);
    } else {
      oscLeft.connect(gainLeft).connect(this.trackBus);
      oscRight.connect(gainRight).connect(this.trackBus);
    }

    oscLeft.start();
    oscRight.start();
    this.oscillators.push(oscLeft, oscRight);

    // Pink noise swell
    this.startOceanSurf();
  }

  startRainSound() {
    // Gentle rain shower synthesiser
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.05;
      b1 = 0.99 * b1 + white * 0.08;
      b2 = 0.96 * b2 + white * 0.15;
      data[i] = (b0 + b1 + b2 + white * 0.1) * 0.04;
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    // Bandpass filter centered at 850Hz for steady raindrops
    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(850, this.ctx.currentTime);
    bandpass.Q.setValueAtTime(0.7, this.ctx.currentTime);

    // Soft lowpass filter to remove harsh treble
    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(2200, this.ctx.currentTime);

    const rainGain = this.ctx.createGain();
    rainGain.gain.setValueAtTime(0.24, this.ctx.currentTime);

    noiseSource.connect(bandpass).connect(lowpass).connect(rainGain).connect(this.trackBus);
    noiseSource.start();
    this.noiseNode = noiseSource;

    // 10Hz gentle alpha undertone (136.1Hz Om frequency)
    const undertone = this.ctx.createOscillator();
    undertone.frequency.setValueAtTime(136.1, this.ctx.currentTime);
    const underGain = this.ctx.createGain();
    underGain.gain.setValueAtTime(0.03, this.ctx.currentTime);
    undertone.connect(underGain).connect(this.trackBus);
    undertone.start();
    this.oscillators.push(undertone);
  }

  startBinaural528Hz() {
    // 528Hz Miraculous Transformation & Repair frequency
    const oscLeft = this.ctx.createOscillator();
    const oscRight = this.ctx.createOscillator();
    const pannerLeft = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    const pannerRight = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

    oscLeft.frequency.setValueAtTime(528, this.ctx.currentTime);
    oscRight.frequency.setValueAtTime(538, this.ctx.currentTime); // 10Hz difference

    const gainLeft = this.ctx.createGain();
    const gainRight = this.ctx.createGain();
    gainLeft.gain.setValueAtTime(0.06, this.ctx.currentTime);
    gainRight.gain.setValueAtTime(0.06, this.ctx.currentTime);

    if (pannerLeft && pannerRight) {
      const w = this._panWidth();
      pannerLeft.pan.setValueAtTime(-w, this.ctx.currentTime);
      pannerRight.pan.setValueAtTime(w, this.ctx.currentTime);
      this._panners.push([pannerLeft, pannerRight]);
      oscLeft.connect(gainLeft).connect(pannerLeft).connect(this.trackBus);
      oscRight.connect(gainRight).connect(pannerRight).connect(this.trackBus);
    } else {
      oscLeft.connect(gainLeft).connect(this.trackBus);
      oscRight.connect(gainRight).connect(this.trackBus);
    }

    oscLeft.start();
    oscRight.start();
    this.oscillators.push(oscLeft, oscRight);

    // Warm deep sub-bass drone (60Hz)
    const drone = this.ctx.createOscillator();
    drone.frequency.setValueAtTime(60, this.ctx.currentTime);
    const droneGain = this.ctx.createGain();
    droneGain.gain.setValueAtTime(0.04, this.ctx.currentTime);
    drone.connect(droneGain).connect(this.trackBus);
    drone.start();
    this.oscillators.push(drone);
  }

  startOceanSurf() {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.035;
      b6 = white * 0.115926;
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, this.ctx.currentTime);

    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.12, this.ctx.currentTime);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(220, this.ctx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    this.oscillators.push(lfo);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.18, this.ctx.currentTime);

    noiseSource.connect(filter).connect(noiseGain).connect(this.trackBus);
    noiseSource.start();
    this.noiseNode = noiseSource;
  }

  stopAll() {
    this.oscillators.forEach(osc => {
      try { osc.stop(); osc.disconnect(); } catch {}
    });
    this.oscillators = [];
    this._panners = [];
    if (this.noiseNode) {
      try { this.noiseNode.stop(); this.noiseNode.disconnect(); } catch {}
      this.noiseNode = null;
    }
    this.isPlaying = false;
    localStorage.setItem('studi_audio_playing', 'false');
    this.updateUIState();
  }

  togglePlay() {
    if (this.isPlaying) {
      this.stopAll();
      if (window.showCalmToast) window.showCalmToast('Đã tạm dừng âm thanh tĩnh lặng.', 'info');
    } else {
      this.playCurrentTrack();
      const track = this.getCurrentTrack();
      if (window.showCalmToast) window.showCalmToast(`Đang phát ${track.title}...`, 'success');
    }
  }

  switchTrack(trackId) {
    if (CALM_TRACKS[trackId]) {
      this.currentTrackId = trackId;
      localStorage.setItem('studi_audio_track', trackId);
      if (this.isPlaying) {
        this.playCurrentTrack();
      } else {
        this.updateUIState();
      }
      const track = this.getCurrentTrack();
      if (window.showCalmToast) window.showCalmToast(`Đã chuyển sang: ${track.title}`, 'info');
    }
  }

  nextTrack() {
    const keys = Object.keys(CALM_TRACKS);
    const currentIdx = keys.indexOf(this.currentTrackId);
    const nextIdx = (currentIdx + 1) % keys.length;
    this.switchTrack(keys[nextIdx]);
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    localStorage.setItem('studi_audio_volume', String(this.volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  // Hẹn giờ tắt thật (phút, 0 = tắt hẹn giờ)
  setSleepTimer(minutes) {
    if (this._sleepId) { clearTimeout(this._sleepId); this._sleepId = null; }
    this.sleepMinutes = minutes || 0;
    try { localStorage.setItem('studi_sleep_timer', String(this.sleepMinutes)); } catch {}
    if (minutes > 0) {
      this._sleepId = setTimeout(() => {
        this.stopAll();
        this._sleepId = null;
        this.sleepMinutes = 0;
        try { localStorage.setItem('studi_sleep_timer', '0'); } catch {}
        if (window.showCalmToast) window.showCalmToast('Hết giờ hẹn — đã tắt âm thanh. Ngủ ngon!', 'info');
        document.dispatchEvent(new CustomEvent('calmAudioSleep'));
      }, minutes * 60 * 1000);
    }
    this.updateUIState();
  }

  updateUIState() {
    const track = this.getCurrentTrack();

    // 1. Update header mini pills
    document.querySelectorAll('.audio-status-pill, [data-audio-pill]').forEach(pill => {
      if (this.isPlaying) {
        pill.classList.add('bg-blue-100', 'text-blue-800', 'border-blue-300');
        pill.classList.remove('bg-blue-50/80', 'text-blue-700');
        const icon = pill.querySelector('svg, span');
        if (icon) icon.classList.add('animate-spin');
      } else {
        pill.classList.remove('bg-blue-100', 'text-blue-800', 'border-blue-300');
        pill.classList.add('bg-blue-50/80', 'text-blue-700');
        const icon = pill.querySelector('svg, span');
        if (icon) icon.classList.remove('animate-spin');
      }
    });

    // 2. Update play/pause buttons
    document.querySelectorAll('[data-action="toggle-audio"]').forEach(btn => {
      btn.innerHTML = this.isPlaying
        ? '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>'
        : '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>';
    });

    // 3. Update Floating Audio Bar if present
    const floatBtn = document.getElementById('ambient-play-toggle');
    const floatTitle = document.getElementById('ambient-track-title');
    const floatSubtitle = document.getElementById('ambient-track-subtitle');
    const floatIcon = document.getElementById('ambient-track-icon');
    const floatWave = document.getElementById('ambient-soundwave');

    if (floatBtn) {
      floatBtn.innerHTML = this.isPlaying
        ? '<svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>'
        : '<svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>';
      floatBtn.className = this.isPlaying
        ? 'w-9 h-9 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-center transition-all shadow-md shadow-blue-500/25 active:scale-95 cursor-pointer'
        : 'w-9 h-9 rounded-xl bg-slate-700 hover:bg-blue-600 text-white flex items-center justify-center transition-all shadow-sm active:scale-95 cursor-pointer';
    }
    if (floatTitle) floatTitle.textContent = track.title;
    if (floatSubtitle) floatSubtitle.textContent = track.subtitle;
    if (floatIcon) floatIcon.textContent = track.icon;
    if (floatWave) {
      floatWave.style.opacity = this.isPlaying ? '1' : '0.2';
    }
  }

  setupFloatingBar() {
    // Chỉ inject trên trang workspace 10-19, TRỪ trang 18 (đã có dock riêng, tránh đè nhau)
    // Hỗ trợ cả http(s)://.../pages/10-... và file:///.../pages/10-...
    const path = window.location.pathname + window.location.href;
    const isWorkspace = /\/(1[0-9]-[^\/]+)\//.test(window.location.pathname) || /\/pages\/1[0-9]-/.test(window.location.href);
    if (!isWorkspace) return;
    if (/18-sound-sanctuary/.test(path)) return;
    if (document.getElementById('studi-ambient-bar')) return;

    const track = this.getCurrentTrack();
    const bar = document.createElement('div');
    bar.id = 'studi-ambient-bar';
    bar.className = 'fixed bottom-5 right-5 z-[9900] flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-white/92 backdrop-blur-xl border border-white/80 shadow-2xl transition-all duration-300 hover:shadow-blue-500/10 hover:border-blue-200/80';
    bar.innerHTML = `
      <button id="ambient-play-toggle" title="Phát / Dừng âm thanh" type="button" class="w-9 h-9 rounded-xl bg-slate-700 text-white flex items-center justify-center transition-all shadow-sm active:scale-95 cursor-pointer">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>
      </button>

      <div class="flex flex-col pr-1 select-none cursor-pointer" id="ambient-info-click" title="Bấm để đổi âm thanh">
        <div class="flex items-center gap-1.5">
          <span id="ambient-track-icon" class="text-sm">${track.icon}</span>
          <span class="text-xs font-bold text-slate-800 tracking-tight" id="ambient-track-title">${track.title}</span>
          <!-- Animated sound waves -->
          <div id="ambient-soundwave" class="flex items-end gap-0.5 h-3 ml-1 opacity-20 transition-opacity">
            <span class="w-0.5 h-2 bg-blue-600 rounded-full animate-bounce"></span>
            <span class="w-0.5 h-3 bg-blue-500 rounded-full animate-bounce [animation-delay:0.15s]"></span>
            <span class="w-0.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:0.3s]"></span>
          </div>
        </div>
        <span class="text-[10px] text-slate-500 font-medium truncate max-w-[160px]" id="ambient-track-subtitle">${track.subtitle}</span>
      </div>

      <!-- Quick Switch Sound Button -->
      <button id="ambient-switch-sound" title="Đổi bài tiếp theo" type="button" class="p-1.5 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition active:scale-90 cursor-pointer">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <!-- Sanctuary Fullscreen Link -->
      <a href="../18-sound-sanctuary/index.html" title="Mở Sanctuary đầy đủ" class="p-1.5 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition active:scale-90">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      </a>
    `;

    document.body.appendChild(bar);

    // Event listeners
    bar.querySelector('#ambient-play-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePlay();
    });

    bar.querySelector('#ambient-info-click').addEventListener('click', () => {
      this.nextTrack();
    });

    bar.querySelector('#ambient-switch-sound').addEventListener('click', (e) => {
      e.stopPropagation();
      this.nextTrack();
    });

    this.updateUIState();
  }
}

const calmAudio = new CalmAudioEngine();
window.CALM_TRACKS = CALM_TRACKS;

document.addEventListener('DOMContentLoaded', () => {
  calmAudio.setupFloatingBar();

  // Connect header mini player clicks
  document.querySelectorAll('.audio-status-pill, [data-audio-pill], [data-action="toggle-audio"]').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', (e) => {
      e.preventDefault();
      calmAudio.togglePlay();
    });
  });

  // If user had sound playing previously, resume on first user interaction to satisfy browser autoplay policy
  const wasPlaying = localStorage.getItem('studi_audio_playing') === 'true';
  if (wasPlaying) {
    const resumeOnInteraction = () => {
      if (!calmAudio.isPlaying) {
        calmAudio.playCurrentTrack();
      }
      document.removeEventListener('click', resumeOnInteraction);
    };
    document.addEventListener('click', resumeOnInteraction, { once: true });
  }
});

window.calmAudio = calmAudio;
