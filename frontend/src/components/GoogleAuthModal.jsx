import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

const DEMO_ACCOUNTS = [
  {
    name: 'Nguyễn Minh Châu',
    email: 'chau.nguyen@vnuhcm.edu.vn',
    tag: 'SSO .EDU.VN',
    initials: 'MC',
    gradient: 'from-blue-600 to-indigo-400',
    isActive: true,
  },
  {
    name: 'Minh Châu (Cá nhân)',
    email: 'minhchau.designer@gmail.com',
    tag: null,
    initials: 'C',
    gradient: 'from-amber-500 to-rose-400',
    isActive: false,
  },
  {
    name: 'AI & HCI Lab Research',
    email: 'lab.hciresearch@gmail.com',
    tag: 'LAB TEAM',
    initials: 'AI',
    gradient: 'from-teal-500 to-cyan-500',
    isActive: false,
  },
];

export default function GoogleAuthModal({ isOpen, onClose }) {
  const { activateAuth } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [loadingEmail, setLoadingEmail] = useState(null);

  if (!isOpen) return null;

  const handleSelectAccount = async (email, name) => {
    setLoadingEmail(email);
    try {
      const res = await api.post('/auth/google', { email, id_token: '' });
      activateAuth(res);
      showToast(`Đăng nhập thành công với tài khoản ${name}!`, 'success');
      onClose();
      navigate('/dashboard');
    } catch (err) {
      showToast(err.message || 'Đăng nhập Google thất bại.', 'error');
    } finally {
      setLoadingEmail(null);
    }
  };

  const handleCustomAccount = () => {
    const customEmail = window.prompt(
      'Nhập email Google/Workspace mẫu của bạn:',
      'chau.nguyen@vnuhcm.edu.vn'
    );
    if (!customEmail || !customEmail.trim()) return;
    handleSelectAccount(customEmail.trim(), customEmail.trim());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Chọn tài khoản Google"
    >
      <div className="relative w-full max-w-[440px] rounded-3xl p-6 sm:p-7 bg-white/95 backdrop-blur-xl border border-white/90 shadow-2xl space-y-5">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng hộp thoại"
          className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
        >
          ✕
        </button>

        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3 flex items-center justify-center">
            <div className="w-14 h-14 rounded-2xl p-2 bg-white border border-blue-100 shadow-md shadow-blue-500/10 flex items-center justify-center">
              <span className="text-2xl">🧠</span>
            </div>
            {/* Google G badge */}
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white shadow border border-slate-100 flex items-center justify-center p-1">
              <svg viewBox="0 0 24 24" className="w-4 h-4">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium tracking-wide uppercase bg-blue-50 text-blue-700 border border-blue-100 mb-2">
            <span>🛡️</span>
            <span>Đăng nhập an toàn với Google</span>
          </span>

          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Chọn một tài khoản</h2>
          <p className="text-xs text-slate-500 mt-1">
            để tiếp tục vào <strong className="font-semibold text-slate-700">Stuđiô AI • Calm Workspace</strong>
          </p>
        </div>

        {/* Account List */}
        <div className="space-y-2.5">
          {DEMO_ACCOUNTS.map((acc) => {
            const isCurrentLoading = loadingEmail === acc.email;
            return (
              <button
                key={acc.email}
                type="button"
                disabled={!!loadingEmail}
                onClick={() => handleSelectAccount(acc.email, acc.name)}
                className="w-full group flex items-center justify-between p-3 rounded-2xl border border-slate-200/80 bg-white hover:bg-blue-50/60 hover:border-blue-300 text-left transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-tr ${acc.gradient} text-white font-bold flex items-center justify-center text-xs shadow-xs ring-2 ring-white`}>
                      {acc.initials}
                    </div>
                    {acc.isActive && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full" title="Tài khoản hoạt động" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-blue-700 transition-colors">{acc.name}</p>
                      {acc.tag && (
                        <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded tracking-wide">
                          {acc.tag}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{acc.email}</p>
                  </div>
                </div>
                <div className="text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2">
                  {isCurrentLoading ? <span className="text-xs animate-spin">⏳</span> : '→'}
                </div>
              </button>
            );
          })}

          {/* Add Another Account */}
          <button
            type="button"
            disabled={!!loadingEmail}
            onClick={handleCustomAccount}
            className="w-full group flex items-center gap-3 p-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 hover:bg-white text-left transition-all cursor-pointer disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-blue-50 text-slate-500 group-hover:text-blue-600 flex items-center justify-center transition-colors shrink-0 text-lg">
              ＋
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors">Thêm tài khoản khác</p>
              <p className="text-[11px] text-slate-400">Sử dụng tài khoản Google hoặc Google Workspace mới</p>
            </div>
          </button>
        </div>

        {/* Security Footer Notice */}
        <div className="px-3.5 py-2.5 rounded-xl bg-blue-50/60 border border-blue-100 text-xs text-slate-600 flex items-start gap-2">
          <span className="text-blue-600 text-sm mt-0.5">🔒</span>
          <p className="text-[11px] leading-relaxed">
            Stuđiô AI chỉ sử dụng quyền định danh cơ bản và không bao giờ chia sẻ tài liệu học tập của bạn.
          </p>
        </div>
      </div>
    </div>
  );
}
