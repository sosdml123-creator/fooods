import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/admin/', // 서브 디렉토리 배포 매핑 고정
  server: {
    port: 5000,
  },
})
