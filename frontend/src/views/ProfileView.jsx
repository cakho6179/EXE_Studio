import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { useAudio } from '../contexts/AudioContext.jsx';
import LogoutConfirmModal from '../components/auth/LogoutConfirmModal.jsx';
import { api } from '../services/api.js';

// FIX: thêm hummingbird (onboarding gửi giá trị này) + ánh xạ qua _ALIASES backend
// (intermediate/bear → hummingbird, dolphin → owl)
const CHRONO_LABEL = { lark: '🌅 Chim Sớm', owl: '🌙 Cú Đêm', hummingbird: '🐦 Chim Ruồi', intermediate: '⚖️ Cân bằng', bear: '🐻 Giữa ngày', dolphin: '🐬 Cú Nhẹ', morning: '🌅 Chim Sớm', evening: '🌙 Cú Đêm' };

export default function ProfileView() {
  const { user, saveUser, logout } = useAuth();
  const { showToast } = useToast();
  const { togglePlay, isPlaying } = useAudio();
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [changingPwd, setChangingPwd] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function confirmLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      setShowLogout(false);
    }
  }

  const profileQ = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get('/auth/profile'),
  });

  const tasksQ = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.get('/tasks/'),
    staleTime: 60000,
  });

  const sessionsQ = useQuery({
    queryKey: ['analytics-sessions', 30],
    queryFn: () => api.get('/focus/sessions?days=30'),
    staleTime: 60000,
  });

  useEffect(() => {
    if (profileQ.data && form === null) setForm({ ...profileQ.data });
  }, [profileQ.data, form]);

  const save = useMutation({
    mutationFn: () => {
      const name = (form.full_name || '').trim();
      if (name.length < 2) throw new Error('Họ và tên tối thiểu 2 ký tự.');
      const clean = (v) => {
        const t = (v ?? '').toString().trim();
        return t ? t : undefined; // Rỗng -> không gửi (backend giữ giá trị cũ)
      };
      const year = Number(form.academic_year);
      const gpa = Number(form.target_gpa);
      const hours = Number(form.target_daily_focus_hours);
      if (form.academic_year !== '' && form.academic_year != null && !(year >= 1 && year <= 7)) throw new Error('Năm học phải từ 1 đến 7.');
      if (form.target_gpa !== '' && form.target_gpa != null && !(gpa >= 0 && gpa <= 4)) throw new Error('GPA mục tiêu phải từ 0 đến 4.');
      if (form.target_daily_focus_hours !== '' && form.target_daily_focus_hours != null && !(hours >= 0.5 && hours <= 16)) throw new Error('Giờ focus phải từ 0.5 đến 16.');
      return api.put('/auth/profile', {
        full_name: name,
        university: clean(form.university),
        major: clean(form.major),
        academic_year: Number.isFinite(year) && year ? Math.round(year) : null,
        chronotype: form.chronotype,
        wake_up_time: form.wake_up_time || null,
        bed_time: form.bed_time || null,
        peak_start_time: form.peak_start_time || null,
        peak_end_time: form.peak_end_time || null,
        target_daily_focus_hours: Number.isFinite(hours) && hours ? hours : null,
        target_gpa: Number.isFinite(gpa) && (gpa || gpa === 0) ? gpa : null,
        preferred_study_style: clean(form.preferred_study_style),
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['pulse'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
      qc.invalidateQueries({ queryKey: ['focus-summary'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      qc.invalidateQueries({ queryKey: ['analytics-dashboard'] });
      if (res?.profile) {
        // Chỉ merge field thuộc User, không trộn field profile (chronotype/wake...)
        const { full_name, university, major, academic_year } = res.profile;
        saveUser({
          ...(user || {}),
          ...(full_name ? { full_name } : {}),
          ...(university ? { university } : {}),
          ...(major ? { major } : {}),
          ...(academic_year != null ? { academic_year } : {}),
        });
      }
      showToast('Đã lưu hồ sơ sinh học & thông tin cá nhân!', 'success');
    },
    onError: (err) => showToast(err.message || 'Không lưu được.', 'error'),
  });

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!pwdForm.current_password) {
      showToast('Vui lòng nhập mật khẩu hiện tại.', 'warning');
      return;
    }
    if (!pwdForm.new_password || pwdForm.new_password.length < 8) {
      showToast('Mật khẩu mới phải có ít nhất 8 ký tự.', 'warning');
      return;
    }
    if (pwdForm.new_password !== pwdForm.confirm_password) {
      showToast('Xác nhận mật khẩu mới không khớp.', 'warning');
      return;
    }
    setChangingPwd(true);
    try {
      const res = await api.post('/auth/change-password', {
        current_password: pwdForm.current_password,
        new_password: pwdForm.new_password,
      });
      showToast(res.message || 'Đã đổi mật khẩu thành công!', 'success');
      setPwdForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      showToast(err.message || 'Không đổi được mật khẩu.', 'error');
    } finally {
      setChangingPwd(false);
    }
  };

  const tasks = Array.isArray(tasksQ.data) ? tasksQ.data : [];
  const sessions = Array.isArray(sessionsQ.data) ? sessionsQ.data : [];
  const doneTasks = tasks.filter((t) => t.status === 'completed').length;
  const focusH = Math.round((sessions.reduce((a, s) => a + (s.actual_minutes || 0), 0) / 60) * 10) / 10;

  const planQ = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => api.get('/billing/status').catch(() => null),
    staleTime: 60000,
  });
  const plan = planQ.data || {};
  const isPro = plan.plan === 'pro';

  const cancelPlan = useMutation({
    mutationFn: () => api.post('/billing/cancel', {}),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['billing-status'] });
      showToast(res.message || 'Đã hủy gói Pro.', 'success');
    },
    onError: (err) => showToast(err.message || 'Không hủy được.', 'error'),
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const inputCls = 'mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-normal bg-white';

  return (
    <div className="max-w-[1000px] mx-auto p-4 md:p-6 lg:p-8 space-y-6">
      <section className="glass-card rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-16 h-16 rounded-3xl bg-linear-to-br from-brand-600 to-indigo-600 text-white flex items-center justify-center text-2xl font-bold shrink-0">
          {(form?.full_name || user?.full_name || 'S')[0].toUpperCase()}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-900">{form?.full_name || user?.full_name || 'Học viên'}</h2>
          <p className="text-xs text-slate-500">
            {form?.email || user?.email} • {form?.major || ''} {form?.academic_year ? `• Năm ${form.academic_year}` : ''}
          </p>
          <p className="mt-1 text-xs font-semibold text-brand-700">
            {CHRONO_LABEL[form?.chronotype] || form?.chronotype || 'Chưa xác định chronotype'}
          </p>
        </div>
        <div className="flex gap-6 text-center" title={tasksQ.isError || sessionsQ.isError ? 'Không tải được thống kê — kiểm tra mạng' : undefined}>
          <div>
            <p className="text-xl font-bold text-slate-900">{tasksQ.isLoading ? '…' : tasksQ.isError ? '—' : doneTasks}</p>
            <p className="text-[11px] text-slate-500">task xong</p>
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{sessionsQ.isLoading ? '…' : sessionsQ.isError ? '—' : `${focusH}h`}</p>
            <p className="text-[11px] text-slate-500">focus 30 ngày</p>
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{sessionsQ.isLoading ? '…' : sessionsQ.isError ? '—' : sessions.length}</p>
            <p className="text-[11px] text-slate-500">phiên sâu</p>
          </div>
        </div>
      </section>

      <section className="glass-card rounded-3xl p-6">
        <h3 className="text-sm font-bold text-slate-800">Thông tin cá nhân</h3>
        {profileQ.isLoading || !form ? (
          profileQ.isError ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-rose-600">Không tải được hồ sơ. Kiểm tra mạng rồi thử lại.</p>
              <button type="button" onClick={() => profileQ.refetch()} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition">
                Thử lại
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500 mt-2">Đang tải…</p>
          )
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="mt-3 grid sm:grid-cols-2 gap-3 text-xs text-slate-600 font-semibold"
          >
            <label>
              Họ và tên
              <input value={form.full_name || ''} onChange={(e) => set('full_name', e.target.value)} className={inputCls} />
            </label>
            <label>
              Email (không đổi)
              <input value={form.email || ''} disabled className={`${inputCls} bg-slate-50 text-slate-400`} />
            </label>
            <label>
              Trường
              <input value={form.university || ''} onChange={(e) => set('university', e.target.value)} className={inputCls} />
            </label>
            <label>
              Ngành học
              <input value={form.major || ''} onChange={(e) => set('major', e.target.value)} className={inputCls} />
            </label>
            <label>
              Năm học
              <input
                type="number"
                min={1}
                max={7}
                value={form.academic_year || ''}
                onChange={(e) => set('academic_year', e.target.value)}
                className={inputCls}
              />
            </label>
            <label>
              Chronotype
              <select value={form.chronotype || ''} onChange={(e) => set('chronotype', e.target.value)} className={inputCls}>
                <option value="lark">🌅 Chim Sớm</option>
                <option value="intermediate">⚖️ Cân bằng</option>
                <option value="hummingbird">🐦 Chim Ruồi (linh hoạt)</option>
                <option value="owl">🌙 Cú Đêm</option>
              </select>
            </label>
            <label>
              Giờ dậy
              <input type="time" value={(form.wake_up_time || '').slice(0, 5)} onChange={(e) => set('wake_up_time', e.target.value)} className={inputCls} />
            </label>
            <label>
              Giờ ngủ
              <input type="time" value={(form.bed_time || '').slice(0, 5)} onChange={(e) => set('bed_time', e.target.value)} className={inputCls} />
            </label>
            <label>
              Đỉnh năng lượng từ
              <input type="time" value={(form.peak_start_time || '').slice(0, 5)} onChange={(e) => set('peak_start_time', e.target.value)} className={inputCls} />
            </label>
            <label>
              Đỉnh năng lượng đến
              <input type="time" value={(form.peak_end_time || '').slice(0, 5)} onChange={(e) => set('peak_end_time', e.target.value)} className={inputCls} />
            </label>
            <label>
              Mục tiêu focus (giờ/ngày)
              <input
                type="number"
                min={1}
                max={16}
                step={0.5}
                value={form.target_daily_focus_hours || ''}
                onChange={(e) => set('target_daily_focus_hours', e.target.value)}
                className={inputCls}
              />
            </label>
            <label>
              GPA mục tiêu
              <input
                type="number"
                min={0}
                max={4}
                step={0.1}
                value={form.target_gpa || ''}
                onChange={(e) => set('target_gpa', e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="sm:col-span-2">
              Phong cách học ưa thích
              <input
                value={form.preferred_study_style || ''}
                onChange={(e) => set('preferred_study_style', e.target.value)}
                placeholder="VD: Pomodoro buổi sáng + nhạc lo-fi"
                className={inputCls}
              />
            </label>
            <div className="sm:col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={save.isPending}
                className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-xs font-bold transition"
              >
                {save.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
              </button>
              <button
                type="button"
                onClick={togglePlay}
                className="px-4 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-100 transition"
              >
                {isPlaying ? '⏸ Tắt nhạc nền' : '🎧 Bật nhạc nền'}
              </button>
              <button
                type="button"
                onClick={() => setShowLogout(true)}
                className="ml-auto px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-100 transition"
              >
                Đăng xuất
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="glass-card rounded-3xl p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Gói sử dụng {isPro && <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">PRO</span>}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {planQ.isLoading ? 'Đang tải gói…' : isPro
                ? `Pro hiệu lực đến ${plan.expires_at ? new Date(plan.expires_at).toLocaleDateString('vi-VN') : 'không thời hạn'}.`
                : 'Bạn đang dùng bản Miễn Phí — nâng cấp để mở full AI, âm thanh và LMS.'}
            </p>
          </div>
          <span className="text-xl">🌟</span>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {isPro ? (
            <button
              type="button"
              onClick={() => { if (window.confirm('Hủy gói Pro? Quyền lợi giữ đến hết chu kỳ đã trả.')) cancelPlan.mutate(); }}
              disabled={cancelPlan.isPending}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 text-xs font-semibold transition"
            >
              {cancelPlan.isPending ? 'Đang hủy…' : 'Hủy gói Pro'}
            </button>
          ) : (
            <Link
              to="/checkout"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-brand-500/25 transition"
            >
              Nâng cấp Pro — 39.000đ/tháng
            </Link>
          )}
        </div>
        {user?.role && user.role !== 'student' && (
          <p className="mt-3 text-[11px] text-slate-400">Vai trò hệ thống: <strong>{user.role}</strong></p>
        )}
      </section>

      <section className="glass-card rounded-3xl p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Bảo mật &amp; Đổi mật khẩu</h3>
            <p className="text-xs text-slate-500 mt-0.5">Cập nhật mật khẩu định kỳ để bảo vệ tài khoản và dữ liệu học tập cá nhân</p>
          </div>
          <span className="text-xl">🔒</span>
        </div>
        <form onSubmit={handleChangePassword} className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-semibold text-slate-700 mt-4">
          <label>
            Mật khẩu hiện tại <span className="text-rose-500">*</span>
            <input
              type="password"
              value={pwdForm.current_password}
              onChange={(e) => setPwdForm({ ...pwdForm, current_password: e.target.value })}
              placeholder="••••••••"
              className={inputCls}
            />
          </label>
            <label>
              Mật khẩu mới (≥ 8 ký tự) <span className="text-rose-500">*</span>
            <input
              type="password"
              value={pwdForm.new_password}
              onChange={(e) => setPwdForm({ ...pwdForm, new_password: e.target.value })}
              placeholder="••••••••"
              className={inputCls}
            />
          </label>
          <label>
            Xác nhận mật khẩu mới <span className="text-rose-500">*</span>
            <input
              type="password"
              value={pwdForm.confirm_password}
              onChange={(e) => setPwdForm({ ...pwdForm, confirm_password: e.target.value })}
              placeholder="••••••••"
              className={inputCls}
            />
          </label>
          <div className="sm:col-span-3 flex justify-end pt-1">
            <button
              type="submit"
              disabled={changingPwd}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black disabled:opacity-60 text-white text-xs font-bold transition shadow-sm cursor-pointer"
            >
              {changingPwd ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}
            </button>
          </div>
        </form>
      </section>

      <LogoutConfirmModal
        isOpen={showLogout}
        onClose={() => { if (!loggingOut) setShowLogout(false); }}
        onConfirm={confirmLogout}
        loading={loggingOut}
        userEmail={user?.email || form?.email || ''}
      />
    </div>
  );
}
