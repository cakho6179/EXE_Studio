import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const ToastCtx = createContext(null);
let seq = 0;

const ICONS = { success: '🌿', info: '🌊', warning: '🌤️', error: '🍃' };
const BORDERS = {
  success: 'rgba(16, 185, 129, 0.4)',
  info: 'rgba(59, 130, 246, 0.4)',
  warning: 'rgba(245, 158, 11, 0.4)',
  error: 'rgba(244, 63, 94, 0.4)',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message, type = 'info', duration = 3500) => {
      const id = ++seq;
      setToasts((list) => [...list.slice(-3), { id, message, type }]);
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
    },
    [dismiss],
  );

  // Tương thích code cũ gọi window.showCalmToast (gán 1 lần trong effect, cleanup khi unmount)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.showCalmToast = showToast;
    }
    return () => {
      if (typeof window !== 'undefined' && window.showCalmToast === showToast) {
        delete window.showCalmToast;
      }
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    };
  }, [showToast]);

  const value = useMemo(() => ({ showToast, dismiss }), [showToast, dismiss]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed bottom-7 right-7 z-[10000] flex flex-col gap-2.5 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2.5 bg-white/95 rounded-2xl px-4 py-3 shadow-lg max-w-[380px] pointer-events-auto"
            style={{ border: `1px solid ${BORDERS[t.type] || 'rgba(255,255,255,0.8)'}` }}
          >
            <span className="text-base shrink-0">{ICONS[t.type] || '✨'}</span>
            <span className="text-[13px] font-medium text-slate-800 leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast phải dùng trong <ToastProvider>');
  return ctx;
}
