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
        chunkFileNames: 'assets/js/[name].js',
        entryFileNames: 'assets/js/[name].js',
        assetFileNames: 'assets/[ext]/[name].[ext]',
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@firebase/') || id.includes('node_modules/firebase/')) {
            return 'vendor-firebase';
          }
        }
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
