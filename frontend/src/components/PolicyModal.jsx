import { useEffect, useState } from 'react';

const TABS = [
  {
    id: 'privacy',
    label: 'Bảo vệ dữ liệu',
    title: 'Bảo vệ dữ liệu học thuật',
    body: [
      'Stuđiô AI chỉ lưu dữ liệu bạn tạo ra (nhiệm vụ, lịch học, phiên focus, nhật ký cảm xúc) để vận hành tính năng.',
      'Chế độ Zero-Data Retention cho AI: nội dung chat với Cố vấn AI không dùng để huấn luyện mô hình.',
      'Bạn có thể xóa tài khoản và toàn bộ dữ liệu bất cứ lúc nào từ trang Hồ sơ.',
    ],
  },
  {
    id: 'terms',
    label: 'Điều khoản',
    title: 'Điều khoản dịch vụ',
    body: [
      'Stuđiô AI là đồ án học thuật phục vụ sinh viên; tính năng AI (Gemini) có thể sai — luôn kiểm chứng trước khi nộp bài.',
      'Không dùng hệ thống cho hành vi gian lận thi cử. Tài khoản demo dùng chung không lưu thông tin nhạy cảm.',
      'Chúng tôi có thể giới hạn tần suất gọi AI để chống lạm dụng.',
    ],
  },
  {
    id: 'integrity',
    label: 'Liêm chính',
    title: 'Cam kết liêm chính học thuật',
    body: [
      'Mọi trích dẫn trong báo cáo tuân chuẩn APA 7th & IEEE — AI chỉ gợi ý, bạn chịu trách nhiệm kiểm chứng nguồn.',
      'Không bao giờ bịa trích dẫn: mục "Tài liệu tham khảo" chỉ liệt kê tài liệu bạn đã nạp.',
      'Ghi rõ phần việc do AI hỗ trợ khi nộp đồ án theo quy định của trường.',
    ],
  },
  {
    id: 'contact',
    label: 'Liên hệ',
    title: 'Liên hệ hỗ trợ',
    body: [
      'Email hỗ trợ học thuật: hotro@studi.edu.vn (phản hồi trong 1-2 ngày học).',
      'Báo lỗi kỹ thuật: kèm ảnh chụp màn hình + các bước tái hiện để được xử lý nhanh.',
    ],
  },
];

export default function PolicyModal({ isOpen, onClose, initialTab = 'privacy' }) {
  const [tab, setTab] = useState(initialTab);
  useEffect(() => {
    if (isOpen) setTab(initialTab);
  }, [isOpen, initialTab]);
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  const active = TABS.find((t) => t.id === tab) || TABS[0];
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-label={active.title}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-white/95 backdrop-blur-xl border border-white/90 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900">{active.title}</h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">✕</button>
        </div>
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${tab === t.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <ul className="space-y-2 text-xs text-slate-600 leading-relaxed">
          {active.body.map((line, i) => (
            <li key={i} className="flex gap-2"><span className="text-brand-600 font-bold">•</span><span>{line}</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}
