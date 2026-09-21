import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Frontend chuan: 1 nguon assets duy nhat = ../frontend/assets,
// build xuat thang vao ../frontend/app (backend serve tu do).
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');

// NOTE: can plugin @vitejs/plugin-react (npm i -D @vitejs/plugin-react)
export default defineConfig({
  base: './',
  publicDir: path.join(FRONTEND_DIR, 'assets'),
  plugins: [react()],
  build: {
    outDir: path.join(FRONTEND_DIR, 'app'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    fs: {
      allow: [__dirname, FRONTEND_DIR],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
