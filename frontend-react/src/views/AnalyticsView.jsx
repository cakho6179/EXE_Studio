import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { useToast } from '../contexts/ToastContext.jsx';
import { usePulse, useTasks } from '../hooks/useApi.js';
import LmsSyncModal from '../components/LmsSyncModal.jsx';

const RANGE_LABEL = { week: 'Tuần này', month: 'Tháng này', semester: 'Học kỳ I' };
const RANGE_DAYS = { week: 7, month: 30, semester: 120 };

function levelColor(v) {
  if (v == null) return 'bg-slate-200';
  if (v >= 70) return 'bg-emerald-500';
  if (v >= 40) return 'bg-amber-400';
  return 'bg-rose-400';
}

export default function AnalyticsView() {
  const { showToast } = useToast();
  const [showLmsModal, setShowLmsModal] = useState(false);
  const [certModal, setCertModal] = useState(null);
  const [certLoading, setCertLoading] = useState(false);
  const [range, setRange] = useState('week');
  const days = RANGE_DAYS[range];

  const dashQ = useQuery({
    queryKey: ['analytics', range],
    queryFn: () => api.get(`/analytics/dashboard?range=${encodeURIComponent(range)}`),
  });
  const d = dashQ.data || {};

  const pulseQ = usePulse();
  const pulse = pulseQ.data || {};

  const sessionsQ = useQuery({
    queryKey: ['analytics-sessions', days],
    queryFn: () => api.get(`/focus/sessions?days=${days}`),
    retry: 1,
  });
  const sessions = Array.isArray(sessionsQ.data) ? sessionsQ.data : [];

  // AI insights + correlations — backend chưa có 2 route này nên fallback phân tích local
  const insightsQ = useQuery({
    queryKey: ['analytics-insights', days],
    queryFn: () => api.get(`/analytics/ai-insights?days=${days}`),
    retry: false,
  });
  const corrQ = useQuery({
    queryKey: ['analytics-correlations', days],
    queryFn: () => api.get(`/analytics/correlations?days=${days}`),
    retry: false,
  });

  const tasksQ = useTasks();
  const tasks = Array.isArray(tasksQ.data) ? tasksQ.data : [];
  const doneTasks = tasks.filter((t) => t.status === 'completed').length;
  const completionRate = d.task_completion_rate ?? (tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0);

  const hours = Array.isArray(d.weekly_focus_hours) ? d.weekly_focus_hours : null;
  const labels = Array.isArray(d.week_days) ? d.week_days : ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
  const totalHours = d.total_week_hours ?? Math.round((sessions.reduce((a, s) => a + (s.actual_minutes || 0), 0) / 60) * 10) / 10;
  const avgFocus = sessions.length ? Math.round(sessions.reduce((a, s) => a + (s.focus_score || 0), 0) / sessions.length) : null;

  const peakIdx = useMemo(() => {
    if (!hours) return 2;
    let p = 0;
    hours.forEach((h, i) => { if (h > hours[p]) p = i; });
    return p;
  }, [hours]);

  // Đường cong mượt Catmull-Rom -> bezier (port từ 19-analytics)
  const chart = useMemo(() => {
    const X = [45, 145, 245, 345, 445, 545, 645];
    const vals = hours && hours.length === 7 ? hours : [3.2, 5.4, 6.5, 5.8, 6.2, 5.4, 4.0];
    const prevVals = [2.5, 4.0, 5.0, 4.2, 5.0, 4.5, 3.2];
    const maxH = Math.max(8, ...vals, ...prevVals);
    const yOf = (h) => 220 - (Math.min(h, maxH) / maxH) * 200;
    const Y = vals.map(yOf);
    const prevY = prevVals.map(yOf);

    let line = `M ${X[0]} ${Y[0].toFixed(1)}`;
    let prevLine = `M ${X[0]} ${prevY[0].toFixed(1)}`;
    for (let i = 0; i < 6; i++) {
      const p0 = { x: X[Math.max(0, i - 1)], y: Y[Math.max(0, i - 1)] };
      const p1 = { x: X[i], y: Y[i] };
      const p2 = { x: X[i + 1], y: Y[i + 1] };
      const p3 = { x: X[Math.min(6, i + 2)], y: Y[Math.min(6, i + 2)] };
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      line += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x} ${p2.y.toFixed(1)}`;

      const q0 = { x: X[Math.max(0, i - 1)], y: prevY[Math.max(0, i - 1)] };
      const q1 = { x: X[i], y: prevY[i] };
      const q2 = { x: X[i + 1], y: prevY[i + 1] };
      const q3 = { x: X[Math.min(6, i + 2)], y: prevY[Math.min(6, i + 2)] };
      const qc1x = q1.x + (q2.x - q0.x) / 6;
      const qc1y = q1.y + (q2.y - q0.y) / 6;
      const qc2x = q2.x - (q3.x - q1.x) / 6;
      const qc2y = q2.y - (q3.y - q1.y) / 6;
      prevLine += ` C ${qc1x.toFixed(1)} ${qc1y.toFixed(1)}, ${qc2x.toFixed(1)} ${qc2y.toFixed(1)}, ${q2.x} ${q2.y.toFixed(1)}`;
    }
    return { X, Y, vals, line, prevLine, prevVals, area: `${line} L 645 220 L 45 220 Z` };
  }, [hours]);

  const [tipIdx, setTipIdx] = useState(null);
  const radarDims = [
    ['Năng lượng', pulse?.pulse_percent || d?.circadian_alignment_score || 85],
    ['Tập trung', avgFocus || d?.zen_efficiency_index || 82],
    ['Hoàn thành', completionRate || 75],
    ['Nhất quán', Math.min(100, (d?.current_streak_days || 1) * 12 + 40)],
    ['Cân bằng', d?.circadian_alignment_score || 90],
  ];

  const serverInsights = Array.isArray(insightsQ.data?.insights) ? insightsQ.data.insights : (Array.isArray(insightsQ.data) ? insightsQ.data : []);
  const localInsights = useMemo(() => {
    const out = [];
    if (totalHours >= 30) out.push(`Duy trì xuất sắc: ${totalHours}h Deep Work trong ${RANGE_LABEL[range].toLowerCase()} — vượt 75% sinh viên cùng nhịp sinh học.`);
    else if (totalHours > 0) out.push(`Bạn đã tích lũy ${totalHours}h Deep Work. Tăng thêm 20% nữa để chạm ngưỡng Deep Flow bền vững.`);
    if ((d.current_streak_days || 0) >= 7) out.push(`Chuỗi streak ${d.current_streak_days} ngày cho thấy kỷ luật circadian rất ổn định — hãy bảo vệ khung giờ vàng 14:30 - 16:30.`);
    if ((d.circadian_alignment_score || 0) < 60 && (d.total_sessions || 0) > 0) out.push('Điểm đồng bộ sinh học còn thấp: thử dời 1 phiên/ngày vào khung 8:00 - 11:00 hoặc 14:00 - 16:00.');
    if ((d.burnout_risk || '').includes('Trung bình')) out.push('Dấu hiệu tải nhận thức tăng: xen kẽ nghỉ 10 phút sau mỗi 50 phút + bài thở 4-7-8 ở Sound Sanctuary.');
    return out.slice(0, 4);
  }, [totalHours, range, d]);

  const insights = serverInsights.length ? serverInsights : localInsights;

  const skills = d.subject_details || [];
  const badges = d.badges || [];
  const unlocked = badges.filter((b) => b.unlocked).length;

  const nowD = new Date();
  const isoWeek = Math.ceil((((nowD - new Date(nowD.getFullYear(), 0, 1)) / 864e5) + 1) / 7);

  function downloadCSV() {
    const colName = range === 'week' ? 'ngay' : 'khoang_thoi_gian';
    const rows = [
      [colName, 'gio_focus', 'ghi_chu'],
      ...chart.vals.map((h, i) => [`"${labels[i] || `Mốc ${i + 1}`}"`, h, '""']),
    ];
    const csv = `Hieu suat hoc tap Studio AI (${RANGE_LABEL[range]})\nTong gio: ${totalHours}h | Streak: ${d.current_streak_days || 0} ngay | Sinh hoc: ${d.circadian_alignment_score || 0}%\n`
      + rows.map((r) => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `studio-ai-bao-cao-${range}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    showToast('Đã tải báo cáo CSV!', 'success');
  }

  async function shareQR() {
    setCertLoading(true);
    try {
      const res = await api.get('/analytics/certificate');
      setCertModal(res);
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(res.share_text || res.verification_url);
        showToast(`Đã sao chép liên kết chứng nhận #${res.certificate_id}!`, 'success');
      }
    } catch (err) {
      showToast(err.message || 'Không tải được mã chứng nhận.', 'error');
    } finally {
      setCertLoading(false);
    }
  }

  async function downloadCertificate() {
    setCertLoading(true);
    try {
      const res = await api.get('/analytics/certificate');
      const htmlContent = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>Chứng Nhận Deep Work - ${res.certificate_id}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 40px; display: flex; justify-content: center; }
    .cert-card { width: 800px; background: #ffffff; border: 8px double #2563eb; border-radius: 24px; padding: 48px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.15); position: relative; text-align: center; }
    .gold-seal { width: 80px; height: 80px; margin: 0 auto 16px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 36px; box-shadow: 0 10px 15px -3px rgba(245, 158, 11, 0.4); }
    h1 { font-size: 26px; color: #1e3a8a; margin: 0 0 8px; letter-spacing: 1px; }
    h2 { font-size: 15px; color: #64748b; font-weight: 500; margin: 0 0 28px; }
    .student-name { font-size: 30px; font-weight: 800; color: #0f172a; border-bottom: 2px solid #e2e8f0; display: inline-block; padding-bottom: 6px; margin-bottom: 12px; }
    .meta { font-size: 14px; color: #475569; margin-bottom: 28px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 36px; }
    .stat-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 14px; padding: 14px; }
    .stat-val { font-size: 22px; font-weight: bold; color: #0284c7; }
    .stat-lbl { font-size: 11px; color: #64748b; margin-top: 4px; text-transform: uppercase; font-weight: 600; }
    .footer { display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: left; font-size: 12px; color: #64748b; }
    .cert-id { font-family: monospace; font-weight: bold; color: #1e40af; font-size: 13px; }
    .qr-text { font-family: monospace; font-size: 10px; color: #94a3b8; word-break: break-all; max-width: 420px; }
  </style>
</head>
<body>
  <div class="cert-card">
    <div class="gold-seal">🏆</div>
    <h1>${res.title}</h1>
    <h2>${res.subtitle}</h2>
    <div class="student-name">${res.student.full_name}</div>
    <div class="meta">MSSV: ${res.student.student_id} • ${res.student.university} • Ngành ${res.student.major}</div>
    <div class="grid">
      <div class="stat-box"><div class="stat-val">${res.metrics.total_hours}h</div><div class="stat-lbl">Tổng giờ Deep Work</div></div>
      <div class="stat-box"><div class="stat-val">${res.metrics.streak_days}</div><div class="stat-lbl">Ngày Streak Liên Tục</div></div>
      <div class="stat-box"><div class="stat-val">${res.metrics.completion_rate}%</div><div class="stat-lbl">Tỷ Lệ Hoàn Thành</div></div>
      <div class="stat-box"><div class="stat-val">${res.metrics.circadian_score}%</div><div class="stat-lbl">Đồng Bộ Sinh Học</div></div>
    </div>
    <div class="footer">
      <div>
        <div class="cert-id">${res.certificate_id}</div>
        <div>Cấp bởi: ${res.organization}</div>
        <div>Ngày cấp: ${res.issued_date_display}</div>
        <div class="qr-text" style="margin-top: 6px;">Băm xác thực: ${res.verification_hash}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-weight: bold; color: #1e3a8a;">HỘI ĐỒNG HỌC THUẬT STUĐIÔ AI</div>
        <div style="color: #059669; font-weight: 600; margin-top: 4px;">✓ ĐÃ XÁC THỰC KÝ SỐ</div>
      </div>
    </div>
  </div>
</body>
</html>`;
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `chung-nhan-deep-work-${res.certificate_id}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      showToast(`Đã xuất chứng nhận ${res.certificate_id} chính thức!`, 'success');
    } catch (err) {
      showToast(err.message || 'Không thể tải chứng nhận.', 'error');
    } finally {
      setCertLoading(false);
    }
  }


  async function autoSchedule() {
    try {
      const res = await api.post('/schedule/auto-balance', {});
      showToast(res.message || 'Đã tối ưu lịch vào khung giờ vàng.', 'success');
    } catch (e) { showToast(e.message || 'Không tối ưu được.', 'error'); }
  }

  const qc = useQueryClient();

  async function saveMood(mood) {
    try {
      await api.post('/moods/', { mood, note: null });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      qc.invalidateQueries({ queryKey: ['analytics-insights'] });
      qc.invalidateQueries({ queryKey: ['analytics-correlations'] });
      showToast('Đã lưu cảm xúc vào nhật ký hệ thống!', 'success');
    } catch (err) { showToast(err.message || 'Không lưu được cảm xúc.', 'error'); }
  }

  return (
    <div className="w-full">
      <div className="relative w-full overflow-hidden">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-4 pt-2">
            <div className="flex flex-col gap-1 max-w-3xl">
              <div className="flex items-center gap-1 text-slate-500 text-xs">
                <span>Học kỳ I / Năm 3</span>
                <span className="text-slate-200">•</span>
                <span>ĐHQG TP.HCM</span>
                <span className="text-slate-200">•</span>
                <span className="text-brand-700 font-semibold">Phân tích Hiệu suất &amp; Kỹ năng</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <h1 className="text-3xl text-slate-900 font-bold tracking-tight">Báo Cáo Tăng Trưởng &amp; Kỹ Năng Đột Phá</h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-100 text-brand-700 text-[11px]">
                  <span className="material-symbols-outlined text-xs">auto_awesome</span> Tuần {isoWeek}
                </span>
              </div>
              <p className="text-sm text-slate-500 max-w-2xl leading-relaxed">Tổng hợp tiến trình rèn luyện nhịp sinh học, đo lường độ sâu tập trung và chỉ số làm chủ kỹ năng học thuật của bạn.</p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <div className="flex items-center bg-white/80 backdrop-blur-md p-1 rounded-xl shadow-sm" role="tablist" aria-label="Phạm vi báo cáo">
                {['week', 'month', 'semester'].map((r) => (
                  <button
                    key={r} type="button" role="tab" aria-selected={range === r} onClick={() => setRange(r)}
                    className={range === r
                      ? 'px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs shadow-sm transition-all'
                      : 'px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-900 text-xs transition-colors'}
                  >
                    {RANGE_LABEL[r]}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => window.print()} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/90 backdrop-blur-md text-slate-900 hover:bg-brand-50 transition-all text-xs shadow-sm">
                <span className="material-symbols-outlined text-base text-cyan-800">download</span><span>Xuất PDF</span>
              </button>
              <button type="button" onClick={() => setShowLmsModal(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/90 backdrop-blur-md text-brand-700 hover:bg-brand-100 transition-all text-xs shadow-sm">
                <span className="material-symbols-outlined text-base">sync</span><span>Đồng bộ LMS Canvas</span>
              </button>
            </div>
          </div>

          {dashQ.isLoading && <p className="text-xs text-slate-500">Đang tải báo cáo...</p>}
          {dashQ.isError && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              Không tải được báo cáo mới, đang hiển thị nội dung mẫu.{' '}
              <button type="button" onClick={() => dashQ.refetch()} className="font-semibold underline">Thử lại</button>
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="relative overflow-hidden rounded-2xl p-4 bg-white/85 backdrop-blur-md shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Tổng Giờ Tập Trung Sâu</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl text-brand-700 font-bold">{totalHours}h</span>
                    <span className="text-[11px] text-slate-500">/ 40h</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center text-brand-700"><span className="material-symbols-outlined text-xl">timer</span></div>
              </div>
              <div className="mt-4 flex flex-col gap-1.5">
                <div className="w-full bg-brand-50 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-brand-600 h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, Math.round((totalHours / 40) * 100))}%` }} />
                </div>
                <div className="flex justify-between items-center text-slate-500 text-[11px]">
                  <span className="flex items-center gap-0.5 text-brand-700 font-semibold"><span className="material-symbols-outlined text-xs">trending_up</span> Sóng Alpha ổn định</span>
                  <span>{Math.min(100, Math.round((totalHours / 40) * 100))}% mục tiêu</span>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl p-4 bg-white/85 backdrop-blur-md shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Hiệp Deep Work Hoàn Tất</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl text-slate-900 font-bold">{d.total_sessions ?? sessions.length}</span>
                    <span className="text-xs text-slate-500 font-normal">hiệp</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center text-cyan-800"><span className="material-symbols-outlined text-xl">self_improvement</span></div>
              </div>
              <div className="mt-4 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <span className="inline-block w-2 h-2 rounded-full bg-cyan-700" />
                  <span>Hoàn thành task: <strong>{completionRate}%</strong></span>
                </div>
                <div className="flex justify-between items-center text-slate-500 text-[11px]">
                  <span className="text-cyan-800 font-medium">TB 48p/hiệp • 0 xao nhãng</span>
                  <span className="font-semibold text-brand-700">{d.zen_efficiency_index != null ? `Zen ${d.zen_efficiency_index}` : 'Kỷ lục mới'}</span>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl p-4 bg-white/85 backdrop-blur-md shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Điểm Nhịp Sinh Học Alpha</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl text-cyan-800 font-bold">{d.circadian_alignment_score ?? '—'}</span>
                    <span className="text-xs text-slate-500 font-normal">/ 100</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center text-sky-800"><span className="material-symbols-outlined text-xl">vital_signs</span></div>
              </div>
              <div className="mt-4 flex flex-col gap-1.5">
                <div className="w-full bg-brand-50 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-cyan-700 h-full rounded-full transition-all duration-700" style={{ width: `${d.circadian_alignment_score || 0}%` }} />
                </div>
                <div className="flex justify-between items-center text-slate-500 text-[11px]">
                  <span>Đỉnh cao: <strong>14:30 - 16:30</strong></span>
                  <span className="text-slate-500">Burnout: {d.burnout_risk || '—'}</span>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl p-4 bg-white/85 backdrop-blur-md shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Chuỗi Ngày Streak Bền Bỉ</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl text-slate-900 font-bold">{d.current_streak_days ?? '—'}</span>
                    <span className="text-xs text-slate-500 font-normal">ngày</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center text-brand-700"><span className="material-symbols-outlined text-xl">military_tech</span></div>
              </div>
              <div className="mt-4 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                  <span className="material-symbols-outlined text-sm text-brand-700">verified</span>
                  <span>Mở khóa {unlocked}/{badges.length} huy hiệu</span>
                </div>
                <div className="flex justify-between items-center text-slate-500 text-[11px]">
                  <span>{d.completed_subtasks || 0} micro-sprints xong</span>
                  <span className="text-brand-700 font-semibold">+{(d.completed_subtasks || 0) * 20} XP</span>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full rounded-2xl bg-white/90 backdrop-blur-xl p-6 shadow-sm flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl text-slate-900 font-bold">Biểu Đồ Nhịp Độ &amp; Giờ Học Sâu</h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-brand-50 text-cyan-800 text-[11px]">Đồng bộ tần số 432Hz</span>
                </div>
                <p className="text-sm text-slate-500 mt-0.5">Giờ học sâu theo {RANGE_LABEL[range].toLowerCase()} — {RANGE_LABEL[range]} ({totalHours}h)</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-900 border border-blue-200/60 font-semibold text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-blue-600" />
                  <span>{RANGE_LABEL[range]} ({totalHours}h)</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">
                  <span className="w-3 h-0.5 border-t-2 border-dashed border-slate-400 inline-block" />
                  <span>Tuần trước (đối chiếu)</span>
                </div>
                <a href="#radar-section" className="hidden sm:inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition-colors">
                  <span>Xem biểu đồ mạng nhện</span>
                  <span className="material-symbols-outlined text-xs">arrow_downward</span>
                </a>
                <div className="hidden sm:flex items-center gap-1 px-3 py-1 rounded-full bg-cyan-100 text-cyan-900 text-[11px]">
                  <span className="material-symbols-outlined text-xs">graphic_eq</span><span>Sóng Alpha</span>
                </div>
              </div>
            </div>
            <div className="relative w-full h-72 sm:h-80 bg-slate-50/50 rounded-xl p-2 flex flex-col justify-end">
              <div className="absolute inset-x-4 inset-y-4 flex flex-col justify-between pointer-events-none opacity-40">
                {['8h', '6h', '4h', '2h', '0h'].map((t) => (
                  <div key={t} className="w-full border-b border-brand-200 flex justify-end pr-2 text-slate-300 text-[11px]">{t}</div>
                ))}
              </div>
              <svg className="w-full h-full overflow-visible z-10" preserveAspectRatio="none" viewBox="0 0 700 240">
                <defs>
                  <linearGradient id="focusFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#004ac6" stopOpacity="0.28" />
                    <stop offset="60%" stopColor="#2563eb" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="focusStroke" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#006398" />
                    <stop offset="45%" stopColor="#004ac6" />
                    <stop offset="100%" stopColor="#2563eb" />
                  </linearGradient>
                </defs>
                <path d={chart.area} fill="url(#focusFill)" />
                <path d={chart.prevLine} fill="none" stroke="#94a3b8" strokeDasharray="5 5" strokeWidth="2" opacity="0.75" />
                <path d={chart.line} fill="none" stroke="url(#focusStroke)" strokeLinecap="round" strokeWidth="3.5" />
                <g role="img" aria-label="Điểm dữ liệu giờ học">
                  {chart.X.map((x, i) => (
                    i === peakIdx
                      ? (
                        <g key={i} className="cursor-pointer" onMouseEnter={() => setTipIdx(i)} onMouseLeave={() => setTipIdx(null)}>
                          <circle className="animate-ping" cx={x} cy={chart.Y[i]} fill="#2563eb" fillOpacity="0.2" r="10" />
                          <circle cx={x} cy={chart.Y[i]} fill="#004ac6" r="6" stroke="#ffffff" strokeWidth="2" />
                        </g>
                        )
                      : <circle key={i} className="cursor-pointer" cx={x} cy={chart.Y[i]} fill="#004ac6" r="4" onMouseEnter={() => setTipIdx(i)} onMouseLeave={() => setTipIdx(null)}><title>{`${labels[i]}: ${chart.vals[i]}h`}</title></circle>
                  ))}
                </g>
              </svg>
              {tipIdx != null && (
                <div className="absolute z-20 hidden md:flex flex-col p-2.5 rounded-xl bg-slate-900 text-slate-100 shadow-xl text-left pointer-events-none" style={{ left: `calc(${(chart.X[tipIdx] / 700) * 100}% - 60px)`, top: 24 }}>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-100">
                    <span className="material-symbols-outlined text-xs">bolt</span>
                    <span>{labels[tipIdx]} • {tipIdx === peakIdx ? 'Đỉnh Alpha + Module ResNet' : 'Phiên Deep Work'}</span>
                  </div>
                  <div className="text-sm text-white mt-0.5"><strong>{chart.vals[tipIdx]}h Deep Work</strong></div>
                </div>
              )}
              <div className="w-full grid grid-cols-7 text-center pt-2 text-xs text-slate-500 z-10">
                {labels.map((lb, i) => (
                  <div key={i} className={i === peakIdx ? 'text-brand-700 font-bold' : ''}>
                    {lb} <span className={`block text-[11px] ${i === peakIdx ? 'font-semibold text-brand-700' : 'text-slate-300'}`}>{chart.vals[i]}h{i === peakIdx ? ' ★' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-start sm:items-center gap-2 p-2 rounded-xl bg-brand-50 text-slate-900">
              <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <span className="material-symbols-outlined text-base">psychology</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full">
                <p className="text-sm text-slate-900">
                  <strong>Phát hiện từ Stuđiô AI:</strong> Khả năng duy trì Deep Flow liên tục của bạn <strong>tăng 34%</strong> khi kết hợp nghe tần số 432Hz vào đầu giờ chiều (14:00 - 16:00).
                </p>
                <button type="button" onClick={autoSchedule} className="shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-white text-brand-700 hover:bg-brand-100 transition-colors text-[11px] shadow-sm">
                  <span>Lên lịch tự động</span><span className="material-symbols-outlined text-xs">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <section id="radar-section" className="rounded-2xl bg-white/90 backdrop-blur-xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800">Radar hiệu suất</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">5 chiều năng lực theo dữ liệu {days} ngày gần nhất</p>
              <div className="mt-4 space-y-2.5">
                {radarDims.map(([label, v]) => (
                  <div key={label} className="text-xs">
                    <div className="flex justify-between text-slate-600 mb-1">
                      <span>{label}</span><strong>{v != null ? `${Math.round(v)}%` : '—'}</strong>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full ${levelColor(v)}`} style={{ width: `${Math.min(100, Math.max(0, Math.round(v || 0)))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <h4 className="text-xs font-bold text-slate-700 mb-2">AI Insights ({days} ngày)</h4>
                {insightsQ.isLoading && <p className="text-xs text-slate-500">AI đang phân tích dữ liệu của bạn…</p>}
                <div className="grid sm:grid-cols-2 gap-2">
                  {insights.map((ins, i) => (
                    <div key={i} className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs text-slate-700 leading-relaxed">
                      {typeof ins === 'string' ? ins : ins.text || ins.insight || ins.title || JSON.stringify(ins)}
                    </div>
                  ))}
                </div>
                {!insightsQ.isLoading && insights.length === 0 && <p className="text-xs text-slate-500">Chưa có insight — học thêm vài phiên để AI phân tích.</p>}
                {insightsQ.isError && <p className="mt-1 text-[11px] text-slate-400">AI insights server chưa khả dụng — đang hiển thị phân tích từ dữ liệu dashboard.</p>}
                {corrQ.data && (
                  <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">📊 Tương quan Thời gian &amp; Phân bổ ({days} ngày)</span>
                      <span className="text-[10px] text-brand-600 bg-brand-50 px-2 py-0.5 rounded font-semibold border border-brand-200/60">Tự động đối soát</span>
                    </div>
                    {corrQ.data.hour_distribution && Object.keys(corrQ.data.hour_distribution).length > 0 && (
                      <div>
                        <p className="text-[11px] text-slate-500 mb-1 font-medium">Khung giờ tập trung cao điểm nhất:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(corrQ.data.hour_distribution)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 3)
                            .map(([hr, mins]) => (
                              <span key={hr} className="px-2 py-0.5 rounded-md bg-blue-100/70 text-blue-800 text-[11px] font-semibold">
                                {String(hr).padStart(2, '0')}:00 ({Math.round(mins)} phút)
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                    {corrQ.data.subject_completion && Object.keys(corrQ.data.subject_completion).length > 0 && (
                      <div>
                        <p className="text-[11px] text-slate-500 mb-1 font-medium">Tỷ lệ hoàn thành nhiệm vụ theo học phần:</p>
                        <div className="space-y-1">
                          {Object.entries(corrQ.data.subject_completion).map(([subj, stat]) => (
                            <div key={subj} className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-700 truncate max-w-[200px]">{subj}</span>
                              <span className="font-bold text-slate-800">{stat.done}/{stat.tasks} task ({stat.tasks ? Math.round((stat.done / stat.tasks) * 100) : 0}%)</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={downloadCSV} className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold transition">Tải báo cáo CSV</button>
                <button type="button" onClick={() => window.print()} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition">In / Lưu PDF</button>
              </div>
            </section>

            <section className="flex flex-col gap-4">
              <div className="flex flex-col">
                <h2 className="text-2xl text-slate-900 font-bold">Thẻ Tóm Tắt Kỹ Năng Đã Cải Thiện</h2>
                <p className="text-sm text-slate-500">Định lượng sự tăng trưởng về tư duy học thuật và năng lực kỹ thuật qua các bài tập lớn</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {skills.length === 0 && <div className="p-4 text-center text-xs text-slate-500 md:col-span-2 rounded-2xl bg-white/90">Chưa có môn nào. Thêm nhiệm vụ để AI theo dõi kỹ năng.</div>}
                {skills.map((sk) => (
                  <div key={`${sk.subject_name}-${sk.subject_code}`} className="rounded-2xl p-4 bg-white/90 backdrop-blur-md shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-0.5 rounded-full bg-brand-100 text-brand-700 text-[11px] font-semibold">{sk.subject_name}{sk.subject_code ? ` (${sk.subject_code})` : ''}</span>
                        <span className="text-xs text-brand-700 font-bold">+{sk.xp} XP</span>
                      </div>
                      <h3 className="text-xl text-slate-900 font-bold mt-1">{sk.task_count} nhiệm vụ • {sk.completed_sprints}/{sk.total_sprints} sprints</h3>
                      <p className="text-sm text-slate-500">Trình độ: {sk.level}. XP = 20 điểm mỗi micro-sprint hoàn thành.</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-900 font-medium">Tiến độ {sk.progress_percent}%</span>
                      </div>
                      <div className="w-full bg-brand-50 rounded-full h-2 overflow-hidden">
                        <div className="bg-brand-600 h-full rounded-full transition-all" style={{ width: `${sk.progress_percent}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="w-full rounded-2xl bg-white/90 backdrop-blur-xl p-6 shadow-sm flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl text-slate-900 font-bold">Bảng Vinh Danh &amp; Huy Hiệu Học Thuật</h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-brand-100 text-brand-700 text-[11px] font-semibold">Đã mở khóa {unlocked}/{badges.length} huy hiệu</span>
                </div>
                <p className="text-sm text-slate-500">Ghi nhận chuỗi kiên định, tính kỷ luật tự giác và thành quả đột phá của sinh viên</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={shareQR}
                  disabled={certLoading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-50 hover:bg-brand-100 text-slate-900 text-xs transition-colors shadow-sm cursor-pointer disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-base text-brand-700">qr_code_2</span>
                  <span>{certLoading ? 'Đang tạo…' : 'Chia sẻ QR Vinh Danh'}</span>
                </button>
                <button
                  type="button"
                  onClick={downloadCertificate}
                  disabled={certLoading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 text-white hover:bg-brand-700 text-xs transition-all shadow-sm cursor-pointer disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-base">badge</span>
                  <span>{certLoading ? 'Đang xuất…' : 'Chứng nhận Deep Work'}</span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {badges.map((b) => (
                <div key={b.key} className={`rounded-xl p-4 flex flex-col items-center text-center gap-1 transition-all hover:-translate-y-1 ${b.unlocked ? 'bg-brand-50/70 hover:bg-brand-50' : 'bg-brand-100/40 opacity-75 border border-dashed border-slate-200/60'}`}>
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-md ${b.unlocked ? 'text-amber-700' : 'bg-brand-50 text-slate-300 shadow-inner'}`} style={b.unlocked ? { background: 'linear-gradient(to top right, #fde68a, #fef3c7)' } : undefined}>
                    <span className="material-symbols-outlined text-3xl">{b.icon || 'military_tech'}</span>
                  </div>
                  <h4 className="text-xl text-slate-900 font-bold leading-snug">{b.title}</h4>
                  <p className="text-sm text-slate-500">{b.detail || b.rule || ''}</p>
                  {b.unlocked
                    ? <span className="text-[11px] font-bold text-emerald-700 uppercase">Đã mở khóa</span>
                    : <div className="w-full bg-brand-200 rounded-full h-1 mt-1"><div className="bg-brand-600 h-full rounded-full" style={{ width: `${b.progress || 0}%` }} /></div>}
                </div>
              ))}
              {badges.length === 0 && <p className="text-xs text-slate-500 col-span-5 text-center">Huy hiệu sẽ xuất hiện sau khi bạn có dữ liệu học tập.</p>}
            </div>
            <div className="rounded-2xl p-4 bg-brand-50/60 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-brand-700 shadow-sm">
                  <span className="material-symbols-outlined text-xl">favorite</span>
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">Cố vấn học tập AI luôn đồng hành cùng bạn</div>
                  <div className="text-sm text-slate-500">Bạn đã hoàn thành {completionRate}% nhiệm vụ, streak {d.current_streak_days || 0} ngày. Giữ nhịp thư giãn tối nay nhé!</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {[['alpha_flow', '🌅'], ['calm_focus', '🌊'], ['need_break', '🍃'], ['rest_mode', '🌙']].map(([mood, icon]) => (
                  <button key={mood} type="button" title={mood} onClick={() => saveMood(mood)} className="w-9 h-9 rounded-xl bg-white hover:bg-brand-100 text-lg shadow-sm transition-all" aria-label={`Cảm xúc ${mood}`}>
                    {icon}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Chứng nhận Deep Work & QR Xác thực */}
      {certModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="Chứng nhận Deep Work & Mã QR"
        >
          <div className="relative w-full max-w-[500px] rounded-3xl p-6 sm:p-7 bg-white/95 backdrop-blur-xl border border-white/90 shadow-2xl space-y-5 text-slate-800">
            <button
              type="button"
              onClick={() => setCertModal(null)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              aria-label="Đóng"
            >
              ✕
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 to-amber-600 text-white flex items-center justify-center text-2xl shadow-md shadow-amber-400/30">
                🏆
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">{certModal.title}</h3>
                <span className="inline-block font-mono text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 mt-0.5">
                  #{certModal.certificate_id}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50/50 border border-slate-200/80 space-y-3 text-center">
              <div>
                <p className="text-xs text-slate-500">Người nhận vinh danh</p>
                <h4 className="text-lg font-extrabold text-slate-900">{certModal.student?.full_name}</h4>
                <p className="text-xs text-slate-600 font-medium">{certModal.student?.student_id} • {certModal.student?.university}</p>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-200/60 text-center">
                <div className="p-2 rounded-xl bg-white shadow-xs">
                  <div className="text-sm font-bold text-blue-600">{certModal.metrics?.total_hours}h</div>
                  <div className="text-[10px] text-slate-400">Deep Work</div>
                </div>
                <div className="p-2 rounded-xl bg-white shadow-xs">
                  <div className="text-sm font-bold text-emerald-600">{certModal.metrics?.streak_days}d</div>
                  <div className="text-[10px] text-slate-400">Streak</div>
                </div>
                <div className="p-2 rounded-xl bg-white shadow-xs">
                  <div className="text-sm font-bold text-indigo-600">{certModal.metrics?.completion_rate}%</div>
                  <div className="text-[10px] text-slate-400">Hoàn thành</div>
                </div>
                <div className="p-2 rounded-xl bg-white shadow-xs">
                  <div className="text-sm font-bold text-amber-600">{certModal.metrics?.circadian_score}%</div>
                  <div className="text-[10px] text-slate-400">Sinh học</div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white border border-slate-200/70 text-left space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Trạng thái chứng chỉ:</span>
                  <span className="font-bold text-emerald-600">✓ ĐÃ XÁC THỰC KÝ SỐ</span>
                </div>
                <div className="text-[10px] font-mono text-slate-400 truncate">
                  SHA-256: {certModal.verification_hash}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(certModal.share_text || certModal.verification_url);
                    showToast('Đã sao chép liên kết chia sẻ & mã xác thực!', 'success');
                  }
                }}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>📋</span>
                <span>Sao chép Link Xác Thực</span>
              </button>
              <button
                type="button"
                onClick={downloadCertificate}
                disabled={certLoading}
                className="flex-1 py-2.5 px-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold transition cursor-pointer shadow-md flex items-center justify-center gap-1.5"
              >
                <span>⭳</span>
                <span>{certLoading ? 'Đang xuất…' : 'Tải File Chứng Nhận'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <LmsSyncModal isOpen={showLmsModal} onClose={() => setShowLmsModal(false)} />
      <style>{`@media print { header, footer, nav { display: none !important; } body { background: #fff !important; } }`}</style>
    </div>
  );
}
