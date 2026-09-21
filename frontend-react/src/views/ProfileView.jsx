import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { useAudio } from '../contexts/AudioContext.jsx';
import { api } from '../services/api.js';

const CHRONO_LABEL = { lark: '🌅 Chim Sớm', owl: '🌙 Cú Đêm', intermediate: '⚖️ Cân bằng', morning: '🌅 Chim Sớm', evening: '🌙 Cú Đêm' };

export default function ProfileView() {
  const { user, saveUser, logout } = useAuth();
  const { showToast } = useToast();
  const { togglePlay, isPlaying } = useAudio();
  const qc = useQueryClient();
  const [form, setForm] = useState(null);

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
    mutationFn: () =>
      api.put('/auth/profile', {
        full_name: form.full_name,
        university: form.university,
        major: form.major,
        academic_year: Number(form.academic_year) || null,
        chronotype: form.chronotype,
        wake_up_time: form.wake_up_time || null,
        bed_time: form.bed_time || null,
        peak_start_time: form.peak_start_time || null,
        peak_end_time: form.peak_end_time || null,
        target_daily_focus_hours: Number(form.target_daily_focus_hours) || null,
        target_gpa: Number(form.target_gpa) || null,
        preferred_study_style: form.preferred_study_style || null,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      if (res?.profile?.full_name || res?.full_name) saveUser({ ...(user || {}), full_name: res.profile?.full_name || res.full_name });
      showToast('Đã lưu hồ sơ!', 'success');
    },
    onError: (err) => showToast(err.message || 'Không lưu được.', 'error'),
  });

  const tasks = Array.isArray(tasksQ.data) ? tasksQ.data : [];
  const sessions = Array.isArray(sessionsQ.data) ? sessionsQ.data : [];
  const doneTasks = tasks.filter((t) => t.status === 'completed').length;
  const focusH = Math.round((sessions.reduce((a, s) => a + (s.actual_minutes || 0), 0) / 60) * 10) / 10;

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
        <div className="flex gap-6 text-center">
          <div>
            <p className="text-xl font-bold text-slate-900">{doneTasks}</p>
            <p className="text-[11px] text-slate-500">task xong</p>
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{focusH}h</p>
            <p className="text-[11px] text-slate-500">focus 30 ngày</p>
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">{sessions.length}</p>
            <p className="text-[11px] text-slate-500">phiên sâu</p>
          </div>
        </div>
      </section>

      <section className="glass-card rounded-3xl p-6">
        <h3 className="text-sm font-bold text-slate-800">Thông tin cá nhân</h3>
        {profileQ.isLoading || !form ? (
          <p className="text-xs text-slate-500 mt-2">Đang tải…</p>
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
                <option value="owl">🌙 Cú Đêm</option>
              </select>
            </label>
            <label>
              Giờ dậy
              <input type="time" value={form.wake_up_time || ''} onChange={(e) => set('wake_up_time', e.target.value)} className={inputCls} />
            </label>
            <label>
              Giờ ngủ
              <input type="time" value={form.bed_time || ''} onChange={(e) => set('bed_time', e.target.value)} className={inputCls} />
            </label>
            <label>
              Đỉnh năng lượng từ
              <input type="time" value={form.peak_start_time || ''} onChange={(e) => set('peak_start_time', e.target.value)} className={inputCls} />
            </label>
            <label>
              Đỉnh năng lượng đến
              <input type="time" value={form.peak_end_time || ''} onChange={(e) => set('peak_end_time', e.target.value)} className={inputCls} />
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
                onClick={() => {
                  if (window.confirm('Đăng xuất khỏi Stuđiô AI?')) logout();
                }}
                className="ml-auto px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-100 transition"
              >
                Đăng xuất
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
