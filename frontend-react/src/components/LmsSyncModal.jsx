import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { useToast } from '../contexts/ToastContext.jsx';

export default function LmsSyncModal({ isOpen, onClose, initialProvider = 'canvas' }) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [provider, setProvider] = useState(initialProvider || 'canvas');
  const [syncing, setSyncing] = useState(false);
  const [includeTimeline, setIncludeTimeline] = useState(true);

  useEffect(() => {
    if (initialProvider) {
      setProvider(initialProvider);
    }
  }, [initialProvider]);

  if (!isOpen) return null;

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/schedule/lms-sync', {
        provider,
        include_timeline: includeTimeline,
      });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
      qc.invalidateQueries({ queryKey: ['schedule'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['focus-summary'] });
      qc.invalidateQueries({ queryKey: ['analytics-dashboard'] });
      qc.invalidateQueries({ queryKey: ['pulse'] });
      showToast(res.message || 'Đồng bộ bài tập & lịch học thành công!', 'success');
      onClose();
    } catch (err) {
      showToast(err.message || 'Không thể đồng bộ với LMS.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Đồng bộ LMS Canvas & Google Classroom"
    >
      <div className="relative w-full max-w-[540px] rounded-3xl p-6 sm:p-7 bg-white/95 backdrop-blur-xl border border-white/90 shadow-2xl space-y-5">
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
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-500 to-amber-500 text-white flex items-center justify-center text-xl shadow-md shadow-rose-500/20">
            🔄
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Đồng bộ LMS &amp; Lịch học</h2>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                1-CLICK
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tự động nhập đồ án, rubric và thời khóa biểu vào Stuđiô AI
            </p>
          </div>
        </div>

        {/* Source Provider Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Chọn nguồn học liệu
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setProvider('canvas')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                provider === 'canvas'
                  ? 'border-rose-400 bg-rose-50/80 text-rose-900 shadow-xs ring-2 ring-rose-200'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="font-bold text-xs flex items-center gap-1.5">
                <span>🔴</span> Canvas LMS
              </div>
              <p className="text-[11px] text-slate-500 mt-1">ĐHQG / VNU / Bách Khoa</p>
            </button>

            <button
              type="button"
              onClick={() => setProvider('classroom')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                provider === 'classroom'
                  ? 'border-emerald-400 bg-emerald-50/80 text-emerald-900 shadow-xs ring-2 ring-emerald-200'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="font-bold text-xs flex items-center gap-1.5">
                <span>🟢</span> Classroom
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Lịch nộp bài &amp; Lớp học</p>
            </button>

            <button
              type="button"
              onClick={() => setProvider('teams')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                provider === 'teams'
                  ? 'border-indigo-400 bg-indigo-50/80 text-indigo-900 shadow-xs ring-2 ring-indigo-200'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="font-bold text-xs flex items-center gap-1.5">
                <span>🟣</span> MS Teams
              </div>
              <p className="text-[11px] text-slate-500 mt-1">MS Education &amp; Họp nhóm</p>
            </button>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-2 rounded-2xl bg-slate-50 p-3.5 border border-slate-200/80 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={includeTimeline}
              onChange={(e) => setIncludeTimeline(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
            />
            <span className="font-medium">Tự động gán các bài tập mới vào Khung giờ vàng tuần này</span>
          </label>
          <p className="text-[11px] text-slate-500 pl-6">
            Thuật toán Circadian sẽ phân bổ các sprint 25 phút vào các khoảng năng lượng Alpha tối ưu.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={syncing}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold shadow-md shadow-blue-500/25 transition flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
          >
            {syncing ? (
              <>
                <span className="animate-spin text-xs">⏳</span>
                <span>Đang kết nối LMS...</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>Bắt đầu Đồng bộ Ngay</span>
              </>
            )}
          </button>
        </div>
        <p className="text-[10px] text-slate-400 text-center">
          Bản hiện tại nhập bộ bài tập mẫu demo theo từng nguồn (chưa kết nối OAuth LMS thật).
        </p>
      </div>
    </div>
  );
}
