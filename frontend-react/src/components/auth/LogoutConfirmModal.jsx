import { useEffect } from 'react';

export default function LogoutConfirmModal({ isOpen, onClose, onConfirm, loading = false, userEmail = '' }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-title"
    >
      <div className="bg-white/95 backdrop-blur-xl rounded-3xl p-6 sm:p-7 max-w-sm w-full text-center shadow-2xl border border-white/90 transform transition-all animate-scaleUp">
        {/* Icon cảnh báo dịu mắt */}
        <div className="w-13 h-13 mx-auto mb-4 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shadow-sm">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        </div>

        <h3 id="logout-title" className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
          Đăng xuất Không gian Học tập?
        </h3>

        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          {userEmail ? (
            <>Tài khoản <span className="font-semibold text-slate-700">{userEmail}</span> sẽ được đăng xuất an toàn.</>
          ) : (
            'Phiên làm việc và tiến trình học tập của bạn đã được đồng bộ an toàn.'
          )}
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 transition-colors disabled:opacity-50"
          >
            Ở lại học tiếp
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {loading ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Đang xử lý...
              </>
            ) : (
              'Đăng xuất ngay'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
