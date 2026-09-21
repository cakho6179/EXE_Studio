import { useRef, useState, useEffect } from 'react';

export default function OtpInput({
  value = '',
  onChange,
  onComplete,
  disabled = false,
  hasError = false,
}) {
  const inputRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    // Tự động focus vào ô OTP khi vừa mở trang
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const moveCursorToEnd = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  };

  const handleChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 6);
    onChange(raw);
    if (raw.length === 6 && onComplete) {
      onComplete(raw);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      onChange(pasted);
      if (pasted.length === 6 && onComplete) {
        onComplete(pasted);
      }
    }
  };

  return (
    <div
      onClick={moveCursorToEnd}
      className="relative flex items-center justify-center gap-2 sm:gap-3 py-2 cursor-text select-none group w-full"
    >
      {/* 
        Native Input: Nằm phủ hoàn toàn trên 6 ô với opacity-0.
        Mọi thao tác gõ số, backspace, paste, autofill từ SMS/email đều được trình duyệt xử lý tự nhiên 100%,
        loại bỏ hoàn toàn các lỗi nhảy focus, kẹt backspace hoặc không nhập đủ 6 số.
      */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        autoComplete="one-time-code"
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        onClick={moveCursorToEnd}
        onFocus={() => {
          setIsFocused(true);
          moveCursorToEnd();
        }}
        onBlur={() => setIsFocused(false)}
        disabled={disabled}
        className="absolute inset-0 w-full h-full opacity-0 cursor-text z-20 text-transparent bg-transparent caret-transparent"
        aria-label="Mã xác thực OTP 6 chữ số"
      />

      {/* 6 Ô hiển thị chữ số trực quan */}
      {[0, 1, 2, 3, 4, 5].map((index) => {
        const char = value[index] || '';
        // Ô đang hoạt động (con trỏ nhấp nháy): là vị trí ký tự tiếp theo cần nhập
        const isCurrentSlot = isFocused && value.length === index;

        return (
          <div
            key={index}
            className={`w-11 h-14 sm:w-13 sm:h-16 flex items-center justify-center text-center text-xl sm:text-2xl font-bold rounded-2xl border-2 transition-all duration-150 ${
              hasError
                ? 'border-rose-400 bg-rose-50/60 text-rose-900 ring-2 ring-rose-100'
                : isCurrentSlot
                ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-4 ring-blue-100 scale-[1.04] shadow-md'
                : char
                ? 'border-blue-500 bg-white text-slate-900 shadow-sm'
                : 'border-slate-200/90 bg-slate-50/80 text-slate-400 group-hover:border-slate-300'
            }`}
          >
            {char ? (
              <span className="transform transition-transform">{char}</span>
            ) : isCurrentSlot ? (
              <span className="w-0.5 h-6 bg-blue-600 rounded-full animate-pulse" />
            ) : (
              <span className="text-slate-300 text-sm font-normal">•</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
