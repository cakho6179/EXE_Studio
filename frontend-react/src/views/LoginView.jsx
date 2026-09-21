import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import PasswordField from '../components/auth/PasswordField.jsx';
import GoogleAuthModal from '../components/GoogleAuthModal.jsx';

export default function LoginView() {
  const { login, guestLogin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem('studi_remembered_email') || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const identity = email.trim();
    if (!identity) {
      setError('Vui lòng nhập địa chỉ email hoặc mã sinh viên.');
      return;
    }
    if (!password) {
      setError('Vui lòng nhập mật khẩu.');
      return;
    }

    setLoading(true);
    try {
      await login(identity, password);

      try {
        if (rememberMe) {
          localStorage.setItem('studi_remembered_email', identity);
        } else {
          localStorage.removeItem('studi_remembered_email');
        }
      } catch {
        /* bỏ qua */
      }

      showToast('Đăng nhập thành công! Đang chuyển vào không gian học tập...', 'success');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg = err?.message || 'Email hoặc mật khẩu không chính xác.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setGuestLoading(true);
    setError('');
    try {
      await guestLogin();
      showToast('Chào mừng đến Stuđiô AI! Đăng nhập thành công bằng tài khoản mẫu.', 'success');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg = err?.message || 'Không kết nối được máy chủ.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <AuthLayout subtitle="Đăng nhập Không gian Học tập Tĩnh Lặng">
      <section className="relative bg-white/85 backdrop-blur-xl rounded-[28px] border border-white/80 shadow-soft-glass p-7 sm:p-9 transition-all duration-300 hover:shadow-2xl hover:bg-white/90">
        {/* Card Header */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3.5">
            <div className="w-14 h-14 rounded-2xl bg-white shadow-md p-1.5 border border-white flex items-center justify-center ring-4 ring-blue-50/50">
              <img alt="Logo Stuđiô AI" className="w-full h-full object-contain" src="/assets/images/logo.png" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-600 border-2 border-white rounded-full flex items-center justify-center">
              <span className="w-1.5 h-1.5 bg-white rounded-full" />
            </span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-50 border border-blue-100/80 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            <span className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider">
              Cổng Sinh viên &amp; Nghiên cứu
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
            Chào mừng trở lại!
          </h2>
          <p className="mt-1 text-xs text-slate-500 max-w-xs leading-relaxed">
            Đăng nhập để tiếp tục lộ trình học tập, tối ưu nhịp sinh học và đồ án nghiên cứu.
          </p>
        </div>

        {/* Error Alert Banner */}
        {error && (
          <div className="mt-4 p-3 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-start gap-2.5 text-xs text-rose-700 animate-fadeIn">
            <svg className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="flex-1 font-medium leading-relaxed">{error}</span>
            <button
              type="button"
              onClick={() => setError('')}
              className="text-rose-400 hover:text-rose-600 font-bold ml-1 text-sm leading-none"
            >
              ×
            </button>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 tracking-wide mb-1.5">
              Email học thuật hoặc Mã số sinh viên <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
              </div>
              <input
                id="login-email"
                type="text"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                placeholder="name@vnuhcm.edu.vn hoặc MSSV"
                required
                autoComplete="username"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200/90 text-xs sm:text-sm rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          <PasswordField
            id="login-password"
            label="Mật khẩu"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
            autoComplete="current-password"
            helperText={
              <Link to="/forgot" className="text-[11.5px] text-blue-600 hover:text-blue-700 hover:underline font-medium">
                Quên mật khẩu?
              </Link>
            }
          />

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-600 font-medium">Ghi nhớ đăng nhập</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Đang kết nối không gian...</span>
              </>
            ) : (
              <>
                <span>Đăng nhập Không gian Học tập</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200/80" />
          </div>
          <div className="relative flex justify-center text-[11px]">
            <span className="px-2.5 bg-white text-slate-400 font-medium uppercase tracking-wider rounded-full">
              Hoặc tiếp tục với
            </span>
          </div>
        </div>

        {/* Social / Demo Actions */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => setShowGoogleModal(true)}
            className="w-full py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Đăng nhập bằng Google Workspace Edu</span>
          </button>

          <button
            type="button"
            disabled={guestLoading}
            onClick={handleGuestLogin}
            className="w-full py-2.5 px-4 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/80 text-emerald-800 text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>⚡ Vào nhanh tài khoản mẫu (Minh Châu • ĐHQG)</span>
          </button>
        </div>

        {/* Footer Link */}
        <p className="mt-6 text-center text-xs text-slate-500">
          Chưa có tài khoản học thuật?{' '}
          <Link to="/register" className="font-bold text-blue-600 hover:text-blue-700 hover:underline">
            Đăng ký tài khoản mới →
          </Link>
        </p>
      </section>

      {/* Google Demo Accounts Modal */}
      {showGoogleModal && <GoogleAuthModal onClose={() => setShowGoogleModal(false)} />}
    </AuthLayout>
  );
}
