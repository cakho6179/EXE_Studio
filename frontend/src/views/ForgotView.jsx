import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext.jsx';
import { api } from '../services/api.js';
import AuthLayout from '../components/auth/AuthLayout.jsx';

export default function ForgotView() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Vui lòng nhập định dạng email hợp lệ (ví dụ: student@vnuhcm.edu.vn).');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/forgot', { email: trimmedEmail });
      try {
        localStorage.setItem('studi_recovery_email', trimmedEmail);
        localStorage.setItem('studi_otp_sent_at', String(Date.now()));
        if (res?.dev_code) {
          sessionStorage.setItem('studi_demo_otp', res.dev_code);
        } else {
          sessionStorage.removeItem('studi_demo_otp');
        }
      } catch {
        /* bỏ qua */
      }

      showToast(res?.message || 'Đã gửi mã xác nhận 6 số đến email của bạn.', 'success');
      if (res?.dev_code) {
        showToast(`Mã OTP demo của bạn: ${res.dev_code}`, 'info', 8000);
      }

      navigate(`/verify?email=${encodeURIComponent(trimmedEmail)}&mode=recovery`);
    } catch (err) {
      const msg = err?.message || 'Không gửi được mã xác nhận. Vui lòng kiểm tra lại email.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout subtitle="Khôi phục Mật khẩu Tài khoản Stuđiô AI">
      <section className="relative bg-white/85 backdrop-blur-xl rounded-[28px] border border-white/80 shadow-soft-glass p-7 sm:p-9 transition-all duration-300 hover:shadow-2xl hover:bg-white/90">
        {/* Card Header */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3.5">
            <div className="w-13 h-13 rounded-2xl bg-amber-50 border border-amber-200/80 shadow-sm flex items-center justify-center text-amber-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-50 border border-amber-200/80 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">
              Khôi phục Quyền truy cập
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
            Quên mật khẩu?
          </h2>
          <p className="mt-1 text-xs text-slate-500 max-w-xs leading-relaxed">
            Nhập email tài khoản học thuật của bạn. Hệ thống sẽ gửi mã OTP 6 số để thiết lập lại mật khẩu an toàn.
          </p>
        </div>

        {/* Error Alert */}
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

        {/* Forgot Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="forgot-email" className="block text-xs font-semibold text-slate-700 tracking-wide mb-1.5">
              Email học thuật đã đăng ký <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
              </div>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                placeholder="chau.nguyen@vnuhcm.edu.vn"
                required
                autoComplete="email"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200/90 text-xs sm:text-sm rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none transition-all"
              />
            </div>
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
                <span>Đang gửi mã...</span>
              </>
            ) : (
              <>
                <span>Gửi mã xác nhận OTP 6 số</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </form>

        {/* Back Link */}
        <div className="mt-6 pt-4 border-t border-slate-100 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Quay lại trang Đăng nhập
          </Link>
        </div>
      </section>
    </AuthLayout>
  );
}
