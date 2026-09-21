import { Link } from 'react-router-dom';

export default function PlaceholderView({ title, back = '/dashboard' }) {
  return (
    <div className="max-w-[1440px] mx-auto p-4 md:p-6 lg:p-8">
      <div className="glass-card rounded-3xl p-10 text-center space-y-3">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">
          Màn hình đang được chuyển từ bản HTML cũ sang React — quay lại sau.
        </p>
        <Link
          to={back}
          className="inline-block px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold transition"
        >
          Về Tổng quan
        </Link>
      </div>
    </div>
  );
}
