import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Android WebView에서 type="module" 문제 해결: ES2015 일반 스크립트 빌드
    target: ['es2015', 'chrome60', 'safari11'],
    outDir: '../backend/www',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // module 청크 방식 대신 단일 포맷으로 묶기
        format: 'iife',
        chunkFileNames: 'assets/js/[name].js',
        entryFileNames: 'assets/js/[name].js',
        assetFileNames: 'assets/[ext]/[name].[ext]',
        // IIFE에서는 manualChunks 불가, 단일 번들로 합침
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
