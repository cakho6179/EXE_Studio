import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { api, getStoredUser } from '../services/api.js';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import PasswordField from '../components/auth/PasswordField.jsx';
import PasswordStrengthBar from '../components/auth/PasswordStrengthBar.jsx';
import OtpInput from '../components/auth/OtpInput.jsx';

const COOLDOWN = 60;

export default function VerifyView() {
  const { activateAuth, user, isLoggedIn } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Chỉ điều hướng về dashboard nếu user đã đăng nhập, đã xác minh email VÀ đã hoàn tất thiết lập onboarding
  useEffect(() => {
    const isOnboarded = user?.is_onboarded || localStorage.getItem('studi_onboarded') === 'true';
    if (isLoggedIn && isOnboarded && user?.is_email_verified) {
      navigate('/dashboard', { replace: true });
    }
  }, [isLoggedIn, user, navigate]);

  const [email, setEmail] = useState('');
  // TODO(FIX-LATER): Tạm chấp nhận mã cố định 123456 (backend ALLOW_FIXED_OTP).
  // Khi nối SMTP thật: xóa hint demo bên dưới, giữ nguyên ô nhập.
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(COOLDOWN);
  const [demoCode, setDemoCode] = useState('');

  // Password Reset Stage
  const [resetMode, setResetMode] = useState(false);
  const [verifiedCode, setVerifiedCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Khởi tạo email từ nhiều nguồn an toàn: URL param -> Session -> Local -> Stored User
  useEffect(() => {
    const urlEmail = searchParams.get('email') || '';
    let sessionVerifyEmail = '';
    let localRecoveryEmail = '';
    let storedDemo = '';
    let sentAt = 0;

    try {
      sessionVerifyEmail = sessionStorage.getItem('studi_verify_email') || '';
      localRecoveryEmail = localStorage.getItem('studi_recovery_email') || '';
      storedDemo = sessionStorage.getItem('studi_demo_otp') || '';
      sentAt = parseInt(localStorage.getItem('studi_otp_sent_at') || '0', 10) || 0;
    } catch {
      /* bỏ qua */
    }

    const resolvedEmail =
      urlEmail.trim() ||
      sessionVerifyEmail.trim() ||
      localRecoveryEmail.trim() ||
      getStoredUser()?.email ||
      '';

    setEmail(resolvedEmail);

    if (/^\d{6}$/.test(storedDemo)) {
      setDemoCode(storedDemo);
    }

    if (sentAt) {
      const elapsed = Math.floor((Date.now() - sentAt) / 1000);
      const remaining = COOLDOWN - elapsed;
      setCooldown(remaining > 0 ? remaining : 0);
    } else {
      setCooldown(0);
    }
  }, [searchParams]);

  // Bộ đếm ngược thời gian gửi lại OTP
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleFillDemoCode = () => {
    if (!demoCode || demoCode.length !== 6) return;
    setCode(demoCode);
    setError('');
    showToast(`Đã tự động điền mã OTP demo: ${demoCode}`, 'info');
  };

  const handleResendOtp = async () => {
    if (cooldown > 0 || !email) return;
    setError('');
    try {
      // Ưu tiên ?mode=recovery từ Forgot (tránh cờ localStorage tồn đọng từ lần quên cũ)
      let isRecovery = searchParams.get('mode') === 'recovery';
      if (!searchParams.get('mode')) {
        try {
          isRecovery = !!localStorage.getItem('studi_recovery_email');
        } catch {
          /* bỏ qua */
        }
      }

      const res = await api.post('/auth/forgot', { email });

      try {
        localStorage.setItem('studi_otp_sent_at', String(Date.now()));
        if (res?.dev_code) {
          sessionStorage.setItem('studi_demo_otp', res.dev_code);
          setDemoCode(res.dev_code);
        }
      } catch {
        /* bỏ qua */
      }

      setCooldown(COOLDOWN);
      const providerLabel = res?.provider === 'resend_api'
        ? 'Resend Cloud Email'
        : (res?.provider === 'smtp_tls' ? 'Gmail SMTP' : 'Email');
      showToast(`Đã gửi lại mã xác minh 6 số qua ${providerLabel}. Vui lòng kiểm tra hộp thư!`, 'info');
      if (res?.dev_code) {
        showToast(`Mã OTP demo của bạn: ${res.dev_code}`, 'info', 8000);
      }
    } catch (err) {
      setError(err?.message || 'Không gửi lại được mã. Vui lòng thử lại sau.');
    }
  };

  const handleVerifyOtp = async (e, customCode) => {
    if (e && e.preventDefault) e.preventDefault();
    if (loading) return;
    setError('');

    const verifyCode = typeof customCode === 'string' ? customCode : code;
    if (!/^\d{6}$/.test(verifyCode)) {
      setError(`Vui lòng nhập đủ 6 chữ số (hiện tại: ${verifyCode.length}/6).`);
      return;
    }

    if (!email) {
      setError('Không tìm thấy email nhận mã. Vui lòng quay lại màn hình trước.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', { email, code: verifyCode });

      let isRecovery = searchParams.get('mode') === 'recovery';
      if (!searchParams.get('mode')) {
        try {
          isRecovery = !!localStorage.getItem('studi_recovery_email');
        } catch {
          /* bỏ qua */
        }
      }

      if (isRecovery) {
        setVerifiedCode(verifyCode);
        setResetMode(true);
        showToast('Xác minh thành công! Hãy nhập mật khẩu mới bên dưới.', 'success');
      } else {
        showToast(res?.message || 'Xác minh tài khoản thành công! Đang chuyển đến bước thiết lập...', 'success');

        try {
          localStorage.removeItem('studi_otp_sent_at');
          sessionStorage.removeItem('studi_demo_otp');
          sessionStorage.removeItem('studi_verify_email');
          localStorage.removeItem('studi_onboarded');

          if (res?.access_token) {
            if (activateAuth) activateAuth(res);
          } else {
            const rawPending = sessionStorage.getItem('studi_pending_auth');
            if (rawPending) {
              const pending = JSON.parse(rawPending);
              if (activateAuth) activateAuth(pending);
            }
          }
          sessionStorage.removeItem('studi_pending_auth');
        } catch {
          /* bỏ qua */
        }

        navigate('/onboarding', { replace: true });
      }
    } catch (err) {
      const msg = err?.message || 'Mã xác nhận không chính xác hoặc đã hết hạn.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp với mật khẩu mới.');
      return;
    }

    setResetLoading(true);
    try {
      const res = await api.post('/auth/reset-password', {
        email,
        code: verifiedCode,
        new_password: newPassword,
      });

      try {
        localStorage.removeItem('studi_recovery_email');
        localStorage.removeItem('studi_otp_sent_at');
        sessionStorage.removeItem('studi_demo_otp');
      } catch {
        /* bỏ qua */
      }

      showToast(res?.message || 'Đặt lại mật khẩu thành công! Hãy đăng nhập lại.', 'success');
      navigate('/login', { replace: true });
    } catch (err) {
      const msg = err?.message || 'Đặt lại mật khẩu không thành công. Vui lòng thử lại.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <AuthLayout subtitle="Xác thực Email &amp; Khôi phục Tài khoản">
      <section className="relative bg-white/85 backdrop-blur-xl rounded-[28px] border border-white/80 shadow-soft-glass p-7 sm:p-9 transition-all duration-300 hover:shadow-2xl hover:bg-white/90">
        {!resetMode ? (
          /* ================= GIAI ĐOẠN 1: NHẬP MÃ OTP 6 CHỮ SỐ ================= */
          <>
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-3">
                <div className="w-13 h-13 rounded-2xl bg-blue-50 border border-blue-100 shadow-sm flex items-center justify-center text-blue-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-50 border border-blue-100/80 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                <span className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider">
                  Xác minh Bảo mật 2 Lớp
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                Nhập mã xác nhận OTP
              </h2>
              <p className="mt-1 text-xs text-slate-500 max-w-xs leading-relaxed">
                Mã 6 chữ số đã được gửi đến hộp thư:{' '}
                <span className="font-bold text-slate-800">{email || 'email của bạn'}</span>
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

            {/* TODO(FIX-LATER): Banner mã demo — xóa khi nối SMTP thật, giữ ô nhập bên dưới */}
            <div className="mt-4 p-3 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-base">🔑</span>
                <div>
                  <span className="text-amber-800 font-medium">Demo tạm thời (chưa nối email thật): nhập </span>
                  <span className="font-mono font-bold text-amber-900 tracking-wider text-sm">123456</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setCode('123456'); setError(''); }}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-200/70 hover:bg-amber-200 text-amber-900 font-semibold text-[11px] transition-colors"
              >
                Điền mã
              </button>
            </div>

            {/* OTP 6 Digits Segmented Input */}
            <form onSubmit={handleVerifyOtp} className="mt-6 space-y-5">
              <div className="flex flex-col items-center justify-center">
                <OtpInput
                  value={code}
                  onChange={(val) => {
                    setCode(val);
                    setError('');
                  }}
                  onComplete={(completedCode) => {
                    handleVerifyOtp(null, completedCode);
                  }}
                  disabled={loading}
                  hasError={!!error}
                />
                <p className="text-[11px] text-slate-400 mt-2 font-medium">
                  Nhấp vào ô để gõ hoặc dán (Ctrl+V) mã xác thực 6 số
                </p>
              </div>

              {/* Submit */}
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
                    <span>Đang xác thực mã...</span>
                  </>
                ) : (
                  <>
                    <span>Xác minh &amp; Tiếp tục</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </>
                )}
              </button>

              {/* Resend Cooldown */}
              <div className="text-center text-xs text-slate-500">
                {cooldown > 0 ? (
                  <span>
                    Chưa nhận được mã? Gửi lại sau{' '}
                    <span className="font-semibold text-blue-600">{cooldown}s</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    className="font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                  >
                    Gửi lại mã xác thực mới →
                  </button>
                )}
              </div>
            </form>

            {/* Back link */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <Link to="/login" className="text-slate-500 hover:text-slate-800 font-medium">
                ← Đăng nhập lại
              </Link>
              <Link to="/register" className="text-blue-600 hover:text-blue-700 font-semibold">
                Đổi email khác
              </Link>
            </div>
          </>
        ) : (
          /* ================= GIAI ĐOẠN 2: THIẾT LẬP MẬT KHẨU MỚI (FORGOT PASSWORD) ================= */
          <>
            <div className="flex flex-col items-center text-center">
              <div className="w-13 h-13 rounded-2xl bg-emerald-50 border border-emerald-100 shadow-sm flex items-center justify-center text-emerald-600 mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-50 border border-emerald-100/80 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
                  Mã OTP Đã Xác Thực
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                Thiết lập Mật khẩu Mới
              </h2>
              <p className="mt-1 text-xs text-slate-500 max-w-xs leading-relaxed">
                Tạo mật khẩu mới cho tài khoản <span className="font-semibold text-slate-700">{email}</span>.
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

            {/* Reset Form */}
            <form onSubmit={handleResetPassword} className="mt-6 space-y-4">
              <div>
                <PasswordField
                  id="new-password"
                  label="Mật khẩu mới"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="Tối thiểu 8 ký tự"
                  autoComplete="new-password"
                />
                <PasswordStrengthBar password={newPassword} />
              </div>

              <PasswordField
                id="confirm-new-password"
                label="Xác nhận mật khẩu mới"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Nhập lại mật khẩu mới"
                autoComplete="new-password"
              />

              <button
                type="submit"
                disabled={resetLoading}
                className="w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 mt-2"
              >
                {resetLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Đang cập nhật mật khẩu...</span>
                  </>
                ) : (
                  <>
                    <span>Hoàn tất &amp; Đăng nhập ngay</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </section>
    </AuthLayout>
  );
}
