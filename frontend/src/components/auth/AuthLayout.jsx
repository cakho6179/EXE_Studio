import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAudio } from '../../contexts/AudioContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function AuthLayout({ children, subtitle = 'Không gian học tập & Trợ lý nhịp sinh học AI' }) {
  const { isPlaying, togglePlay } = useAudio();
  const { showToast } = useToast();

  const [calmMode, setCalmMode] = useState(() => {
    try {
      return localStorage.getItem('studi_calm_night') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCalmMode = () => {
    const next = !calmMode;
    setCalmMode(next);
    try {
      localStorage.setItem('studi_calm_night', String(next));
      if (next) {
        document.documentElement.classList.add('calm-night');
        showToast('🌙 Đã bật Chế độ Dịu Mắt Ban Đêm (Calm Night Mode).', 'info');
      } else {
        document.documentElement.classList.remove('calm-night');
        showToast('☀️ Đã trở về Chế độ Tiêu Chuẩn.', 'info');
      }
    } catch {
      /* bỏ qua */
    }
  };

  useEffect(() => {
    if (calmMode) {
      document.documentElement.classList.add('calm-night');
    }
  }, [calmMode]);

  return (
    <div className="font-sans text-slate-800 antialiased min-h-screen relative flex flex-col justify-between select-none overflow-x-hidden">
      {/* Background layer */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" data-purpose="background-scenery">
        <img
          alt="Khung cảnh màu nước ngọn hải đăng bình yên hoàng hôn"
          className="w-full h-full object-cover object-center filter brightness-[1.02] contrast-[0.98] scale-[1.01]"
          src="/assets/images/lighthouse-wide.png"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/35 via-transparent to-slate-900/30" />
        <div className="absolute inset-0 backdrop-blur-[1.5px]" />
      </div>

      {/* TopBar */}
      <header className="relative z-20 w-full px-4 sm:px-8 pt-5 pb-2" data-purpose="ambient-header">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/75 hover:bg-white text-slate-700 text-xs font-semibold border border-white/80 shadow-sm transition-all"
            >
              <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Trang chủ
            </Link>
            <div className="hidden sm:inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/70 backdrop-blur-md border border-white/80 shadow-sm text-xs text-slate-700">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium tracking-wide">Chế độ tĩnh lặng</span>
              <span className="text-slate-300">|</span>
              <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Calm Mode ON</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border text-xs shadow-sm transition-all cursor-pointer ${
                isPlaying
                  ? 'bg-blue-100/90 border-blue-300 text-blue-800'
                  : 'bg-white/70 hover:bg-white/95 border-white/80 text-slate-600'
              }`}
              title={isPlaying ? 'Bấm để tạm dừng âm thanh 432Hz' : 'Bấm để bật âm thanh sóng biển 432Hz'}
            >
              <svg
                className={`w-3.5 h-3.5 ${isPlaying ? 'text-blue-600 animate-spin' : 'text-slate-400'}`}
                fill="none"
                stroke="currentColor"
                style={{ animationDuration: '8s' }}
                viewBox="0 0 24 24"
              >
                <path
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
              <span className="font-normal text-[11.5px] hidden md:inline">
                {isPlaying ? 'Sóng biển 432Hz' : 'Lofi 432Hz'}
              </span>
            </button>

            <button
              type="button"
              onClick={toggleCalmMode}
              className="p-2 rounded-full bg-white/70 hover:bg-white/95 text-slate-600 border border-white/80 shadow-sm transition-all"
              title="Chuyển chế độ dịu mắt ban đêm"
            >
              {calmMode ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-grow flex items-center justify-center py-6 px-4 sm:px-6">
        <div className="w-full max-w-[490px] mx-auto">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-4 px-4 text-center text-[11.5px] text-slate-500">
        <p className="flex items-center justify-center gap-2 flex-wrap">
          <span>© 2026 Stuđiô AI • Không gian học tập tĩnh lặng sinh viên</span>
          <span>•</span>
          <span className="text-emerald-700 font-medium">Bảo mật FERPA &amp; GDPR</span>
        </p>
      </footer>
    </div>
  );
}
