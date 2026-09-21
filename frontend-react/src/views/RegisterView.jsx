import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import PasswordField from '../components/auth/PasswordField.jsx';
import PasswordStrengthBar from '../components/auth/PasswordStrengthBar.jsx';
import GoogleAuthModal from '../components/GoogleAuthModal.jsx';

const UNIVERSITIES = [
  { value: 'vnu-hcm', label: 'ĐHQG TP.HCM (VNU-HCM)' },
  { value: 'vnu-hn', label: 'ĐHQG Hà Nội (VNU-HN)' },
  { value: 'hust', label: 'Đại học Bách Khoa Hà Nội (HUST)' },
  { value: 'bku', label: 'Trường ĐH Bách Khoa - ĐHQG TP.HCM' },
  { value: 'uit', label: 'Trường ĐH Công nghệ Thông tin (UIT)' },
  { value: 'hcmus', label: 'Trường ĐH Khoa học Tự nhiên (HCMUS)' },
  { value: 'ftu', label: 'Đại học Ngoại Thương (FTU)' },
  { value: 'ueh', label: 'Đại học Kinh tế TP.HCM (UEH)' },
  { value: 'other', label: 'Trường Đại học / Học viện khác' },
];

export default function RegisterView() {
  const { register } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [university, setUniversity] = useState('vnu-hcm');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showGoogleModal, setShowGoogleModal] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      setError('Vui lòng nhập họ và tên đầy đủ (tối thiểu 2 ký tự).');
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Vui lòng nhập định dạng email hợp lệ (ví dụ: student@vnuhcm.edu.vn).');
      return;
    }

    if (password.length < 8) {
      setError('Mật khẩu bảo vệ tài khoản phải có ít nhất 8 ký tự.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp với mật khẩu đã nhập.');
      return;
    }

    if (!agreeTerms) {
      setError('Vui lòng đồng ý với Điều khoản dịch vụ và Chính sách bảo mật.');
      return;
    }

    setLoading(true);
    try {
      const selectedUni = UNIVERSITIES.find((u) => u.value === university)?.label || university;
      const regResult = await register({
        email: trimmedEmail,
        password,
        full_name: trimmedName,
        university: selectedUni,
        major: 'Công nghệ Thông tin',
        academic_year: 3,
      });

      try {
        localStorage.removeItem('studi_recovery_email');
        localStorage.setItem('studi_otp_sent_at', String(Date.now()));
        sessionStorage.setItem('studi_verify_email', trimmedEmail);
        sessionStorage.setItem('studi_pending_auth', JSON.stringify(regResult));
        if (regResult.dev_code) {
          sessionStorage.setItem('studi_demo_otp', regResult.dev_code);
        } else {
          sessionStorage.removeItem('studi_demo_otp');
        }
      } catch {
        /* bỏ qua */
      }

      if (regResult.dev_code) {
        showToast(`Đăng ký thành công! Mã OTP xác minh demo: ${regResult.dev_code}`, 'info', 8000);
      } else {
        showToast('Đăng ký thành công! Mã xác minh 6 số đã được gửi đến email của bạn.', 'success');
      }

      navigate(`/verify?email=${encodeURIComponent(trimmedEmail)}`);
    } catch (err) {
      const msg = err?.message || 'Đăng ký không thành công. Email này có thể đã được sử dụng.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout subtitle="Đăng ký Không gian Học tập Tĩnh Lặng">
      <section className="relative bg-white/85 backdrop-blur-xl rounded-[28px] border border-white/80 shadow-soft-glass p-7 sm:p-9 transition-all duration-300 hover:shadow-2xl hover:bg-white/90">
        {/* Card Header */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3">
            <div className="w-13 h-13 rounded-2xl bg-white shadow-md p-1.5 border border-white flex items-center justify-center ring-4 ring-blue-50/50">
              <img alt="Logo Stuđiô AI" className="w-full h-full object-contain" src="/assets/images/logo.png" />
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-50 border border-blue-100/80 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider">
              Khởi tạo Tài khoản Sinh viên
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
            Tạo Không gian Học tập
          </h2>
          <p className="mt-1 text-xs text-slate-500 max-w-xs leading-relaxed">
            Thiết lập phòng học cá nhân hóa với sóng não Alpha, trợ lý đồ án và đồng bộ Canvas.
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

        {/* Register Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          {/* Full Name */}
          <div>
            <label htmlFor="reg-name" className="block text-xs font-semibold text-slate-700 tracking-wide mb-1">
              Họ và tên sinh viên <span className="text-rose-500">*</span>
            </label>
            <input
              id="reg-name"
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (error) setError('');
              }}
              placeholder="Ví dụ: Nguyễn Minh Châu"
              required
              className="w-full px-3.5 py-2.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200/90 text-xs sm:text-sm rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none transition-all"
            />
          </div>

          {/* University */}
          <div>
            <label htmlFor="reg-uni" className="block text-xs font-semibold text-slate-700 tracking-wide mb-1">
              Trường Đại học / Viện nghiên cứu
            </label>
            <select
              id="reg-uni"
              value={university}
              onChange={(e) => setUniversity(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200/90 text-xs sm:text-sm rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none transition-all"
            >
              {UNIVERSITIES.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          {/* Email */}
          <div>
            <label htmlFor="reg-email" className="block text-xs font-semibold text-slate-700 tracking-wide mb-1">
              Email học thuật (.edu.vn hoặc cá nhân) <span className="text-rose-500">*</span>
            </label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
              placeholder="chau.nguyen@vnuhcm.edu.vn"
              required
              autoComplete="email"
              className="w-full px-3.5 py-2.5 bg-slate-50/70 hover:bg-white focus:bg-white border border-slate-200/90 text-xs sm:text-sm rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none transition-all"
            />
          </div>

          {/* Password */}
          <div>
            <PasswordField
              id="reg-password"
              label="Mật khẩu bảo vệ"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
              placeholder="Tối thiểu 8 ký tự"
              autoComplete="new-password"
            />
            <PasswordStrengthBar password={password} />
          </div>

          {/* Confirm Password */}
          <div>
            <PasswordField
              id="reg-confirm-password"
              label="Xác nhận lại mật khẩu"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (error) setError('');
              }}
              placeholder="Nhập lại chính xác mật khẩu trên"
              autoComplete="new-password"
            />
          </div>

          {/* Terms Agreement */}
          <div className="pt-1">
            <label className="flex items-start gap-2 cursor-pointer select-none text-[11.5px] text-slate-600 leading-snug">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                Tôi đồng ý với <span className="text-blue-600 font-semibold underline">Điều khoản sử dụng</span> &amp; cam kết tuân thủ liêm chính học thuật.
              </span>
            </label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 mt-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Đang khởi tạo tài khoản...</span>
              </>
            ) : (
              <>
                <span>Tiếp tục: Xác minh Mã OTP</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200/80" />
          </div>
          <div className="relative flex justify-center text-[11px]">
            <span className="px-2.5 bg-white text-slate-400 font-medium uppercase tracking-wider rounded-full">
              Hoặc đăng ký nhanh
            </span>
          </div>
        </div>

        {/* Social */}
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
          <span>Đăng ký nhanh qua Google Workspace</span>
        </button>

        {/* Footer Link */}
        <p className="mt-5 text-center text-xs text-slate-500">
          Đã có tài khoản Stuđiô AI?{' '}
          <Link to="/login" className="font-bold text-blue-600 hover:text-blue-700 hover:underline">
            Đăng nhập ngay →
          </Link>
        </p>
      </section>

      {/* Google Modal */}
      {showGoogleModal && <GoogleAuthModal onClose={() => setShowGoogleModal(false)} />}
    </AuthLayout>
  );
}
