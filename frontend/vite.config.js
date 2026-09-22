import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend chuan duy nhat: source + assets + build output deu trong thu muc frontend/.
// - Dev: vite serve /assets/* tu ./assets, proxy /api ve FastAPI :8000
// - Build: xuat vao ./app (backend serve tai /app/, gitignore).
export default defineConfig({
  base: './',
  publicDir: './assets',
  plugins: [react()],
  build: {
    outDir: './app',
    emptyOutDir: true,
  },
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
