import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 飞书多维表格插件要求：base 必须为 './'，否则部署失败
export default defineConfig({
  base: './',
  publicDir: 'public-runtime',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2019',
    chunkSizeWarningLimit: 1500,
  },
});
