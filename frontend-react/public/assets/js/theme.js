/**
 * Stuđiô AI - Shared Tailwind Theme (single source of truth).
 * Thay thế toàn bộ khối tailwind.config inline lẻ tẻ ở từng trang.
 * Nạp SAU script CDN tailwindcss (Play CDN tự nhận config khi gán).
 */
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        primary: '#2563eb',
        secondary: '#006398',
        'secondary-container': '#5bb8fe',
        calm: {
          blue: '#2563eb',
          'blue-hover': '#1d4ed8',
        },
      },
      boxShadow: {
        'soft-glass': '0 20px 45px -12px rgba(15, 23, 42, 0.12), 0 0 1px 1px rgba(255, 255, 255, 0.8) inset',
        'ambient': '0 12px 36px -8px rgba(37, 99, 235, 0.25)',
        'calm': '0 10px 30px -5px rgba(22, 53, 107, 0.08)',
        'glow': '0 0 24px rgba(37, 99, 235, 0.35)',
        'pill': '0 4px 15px -2px rgba(15, 23, 42, 0.05)',
        'glass': '0 10px 30px -5px rgba(22, 53, 107, 0.06), 0 4px 12px -2px rgba(0, 0, 0, 0.03)',
        'glow-blue': '0 0 24px rgba(14, 165, 233, 0.35)',
      },
    },
  },
};
