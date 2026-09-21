import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// NOTE: can plugin @vitejs/plugin-react (npm i -D @vitejs/plugin-react)
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
