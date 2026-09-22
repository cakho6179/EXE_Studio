export default function PasswordStrengthBar({ password = '' }) {
  if (!password) return null;

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;

  const labels = ['Rất yếu', 'Yếu', 'Trung bình', 'Khá mạnh', 'Rất mạnh (Tối ưu)'];
  const colors = [
    'bg-rose-500',
    'bg-amber-500',
    'bg-amber-400',
    'bg-blue-500',
    'bg-emerald-500',
  ];

  return (
    <div className="w-full mt-2">
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-slate-500">Độ mạnh mật khẩu:</span>
        <span className={`font-semibold ${score >= 3 ? 'text-emerald-600' : score >= 2 ? 'text-amber-600' : 'text-rose-600'}`}>
          {labels[score]}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5 h-1.5 w-full">
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className={`h-full rounded-full transition-all duration-300 ${
              score >= step ? colors[score] : 'bg-slate-200'
            }`}
          />
        ))}
      </div>

      <p className="text-[10.5px] text-slate-400 mt-1">
        Gợi ý: Tối thiểu 8 ký tự, kết hợp chữ hoa, chữ thường, số và ký tự đặc biệt.
      </p>
    </div>
  );
}
