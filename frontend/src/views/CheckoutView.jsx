import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import { api } from '../services/api.js';

const PROVIDERS = [
  { id: 'momo', icon: '💗', name: 'Ví MoMo', desc: 'Quét mã / xác nhận trên app MoMo' },
  { id: 'card', icon: '💳', name: 'Thẻ ATM / Visa', desc: 'Nhập số thẻ ở bước tiếp theo (demo)' },
  { id: 'bank', icon: '🏦', name: 'Chuyển khoản', desc: 'VietQR ngân hàng nội địa' },
  { id: 'demo', icon: '🧪', name: 'Kích hoạt demo', desc: 'Không trừ tiền — dùng để trải nghiệm' },
];

const fmtVND = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;

export default function CheckoutView() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [cycle, setCycle] = useState('monthly');
  const [provider, setProvider] = useState('momo');
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(null);

  const plansQ = useQuery({ queryKey: ['billing-plans'], queryFn: () => api.get('/billing/plans'), staleTime: 10 * 60 * 1000 });
  const statusQ = useQuery({ queryKey: ['billing-status'], queryFn: () => api.get('/billing/status'), staleTime: 30000 });

  const plans = plansQ.data?.plans || {};
  const cycles = plansQ.data?.cycles || {};
  const pro = plans.pro || {};
  const status = statusQ.data || {};
  const isPro = status.plan === 'pro';
  const amount = pro[cycle] || 0;

  async function submit(e) {
    e.preventDefault();
    if (paying) return;
    setPaying(true);
    try {
      const res = await api.post('/billing/checkout', {
        plan: 'pro',
        cycle,
        provider,
        edu_email: user?.email || null,
      });
      setDone(res.subscription);
      qc.invalidateQueries({ queryKey: ['billing-status'] });
      showToast(res.message || 'Kích hoạt Pro thành công!', 'success');
    } catch (err) {
      showToast(err.message || 'Thanh toán thất bại.', 'error');
    } finally {
      setPaying(false);
    }
  }

  async function cancel() {
    if (!window.confirm('Hủy gói Pro? Quyền lợi giữ đến hết chu kỳ đã trả.')) return;
    try {
      const res = await api.post('/billing/cancel', {});
      qc.invalidateQueries({ queryKey: ['billing-status'] });
      setDone(null);
      showToast(res.message || 'Đã hủy gói Pro.', 'success');
    } catch (err) {
      showToast(err.message || 'Không hủy được.', 'error');
    }
  }

  return (
    <div className="max-w-[1000px] mx-auto p-4 md:p-6 lg:p-8 space-y-6">
      <section className="glass-card rounded-3xl p-6">
        <p className="text-[11px] uppercase tracking-widest text-brand-600 font-bold">Thanh toán</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Nâng cấp Stuđiô Pro Sinh Viên</h1>
        <p className="text-xs text-slate-500 mt-1">
          {user?.email || ''} • Giá ưu đãi .edu.vn • Hủy bất cứ lúc nào, giữ quyền lợi đến hết chu kỳ.
        </p>
      </section>

      {isPro && !done ? (
        <section className="glass-card rounded-3xl p-6 text-center space-y-3">
          <p className="text-3xl">🌟</p>
          <h2 className="text-base font-bold text-slate-900">Bạn đang dùng gói Pro</h2>
          <p className="text-xs text-slate-500">
            Hiệu lực đến {status.expires_at ? new Date(status.expires_at).toLocaleDateString('vi-VN') : 'không thời hạn'}.
          </p>
          <div className="flex justify-center gap-2">
            <Link to="/dashboard" className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition">
              Vào học →
            </Link>
            <button type="button" onClick={cancel} className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition">
              Hủy gói
            </button>
          </div>
        </section>
      ) : done ? (
        <section className="glass-card rounded-3xl p-6 text-center space-y-3">
          <p className="text-3xl">🎉</p>
          <h2 className="text-base font-bold text-slate-900">Kích hoạt Pro thành công!</h2>
          <p className="text-xs text-slate-500">
            Gói {done.cycle === 'yearly' ? 'năm' : 'tháng'} • {fmtVND(done.amount)} •
            hiệu lực đến {done.expires_at ? new Date(done.expires_at).toLocaleDateString('vi-VN') : '—'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard', { replace: true })}
            className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition"
          >
            Vào không gian học tập →
          </button>
        </section>
      ) : (
        <form onSubmit={submit} className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="space-y-6">
            <section className="glass-card rounded-3xl p-6">
              <h2 className="text-sm font-bold text-slate-800 mb-3">1. Chọn chu kỳ</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {['monthly', 'yearly'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCycle(c)}
                    aria-pressed={cycle === c}
                    className={`p-4 rounded-2xl border text-left transition ${cycle === c ? 'bg-brand-50 border-brand-300 ring-2 ring-brand-100' : 'bg-white/80 border-slate-200 hover:border-brand-200'}`}
                  >
                    <p className="text-sm font-bold text-slate-900">
                      {c === 'monthly' ? 'Theo tháng' : 'Theo năm'}
                      {c === 'yearly' && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">TIẾT KIỆM 2 THÁNG</span>}
                    </p>
                    <p className="mt-1 text-xl font-extrabold text-brand-700">{fmtVND(pro[c])}<span className="text-xs font-normal text-slate-500">/{c === 'monthly' ? 'tháng' : 'năm'}</span></p>
                    <p className="text-[11px] text-slate-500">{cycles[c]?.label || ''}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="glass-card rounded-3xl p-6">
              <h2 className="text-sm font-bold text-slate-800 mb-3">2. Phương thức thanh toán</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProvider(p.id)}
                    aria-pressed={provider === p.id}
                    className={`p-4 rounded-2xl border text-left transition ${provider === p.id ? 'bg-brand-50 border-brand-300 ring-2 ring-brand-100' : 'bg-white/80 border-slate-200 hover:border-brand-200'}`}
                  >
                    <p className="text-sm font-bold text-slate-900">{p.icon} {p.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{p.desc}</p>
                  </button>
                ))}
              </div>
              {provider === 'demo' && (
                <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  Chế độ demo: kích hoạt ngay không trừ tiền. Cổng MoMo/thẻ thật sẽ nối ở bản production.
                </p>
              )}
            </section>
          </div>

          <aside className="glass-card rounded-3xl p-6 lg:sticky lg:top-24">
            <h2 className="text-sm font-bold text-slate-800">3. Xác nhận đơn hàng</h2>
            <div className="mt-3 space-y-2 text-xs text-slate-600">
              <div className="flex justify-between"><span>Gói</span><strong className="text-slate-900">{pro.name || 'Stuđiô Pro'}</strong></div>
              <div className="flex justify-between"><span>Chu kỳ</span><strong className="text-slate-900">{cycle === 'monthly' ? 'Tháng' : 'Năm'}</strong></div>
              <div className="flex justify-between"><span>Thanh toán</span><strong className="text-slate-900">{PROVIDERS.find((p) => p.id === provider)?.name}</strong></div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-sm"><span>Tổng cộng</span><strong className="text-brand-700 text-lg">{fmtVND(amount)}</strong></div>
            </div>
            <ul className="mt-3 space-y-1.5 text-[11px] text-slate-500">
              {(pro.features || []).map((f) => (
                <li key={f}>✓ {f}</li>
              ))}
            </ul>
            <button
              type="submit"
              disabled={paying || plansQ.isLoading}
              className="mt-4 w-full px-5 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 disabled:opacity-60 text-white text-sm font-bold shadow-lg shadow-brand-500/30 transition"
            >
              {paying ? 'Đang xử lý…' : `Thanh toán ${fmtVND(amount)}`}
            </button>
            <p className="mt-2 text-[10px] text-slate-400 text-center">Demo học thuật — chưa trừ tiền thật.</p>
          </aside>
        </form>
      )}
    </div>
  );
}
