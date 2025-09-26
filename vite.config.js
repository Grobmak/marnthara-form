import { defineConfig } from 'vite';

export default defineConfig({
  // การตั้งค่าสำหรับ Production (เมื่อสั่ง npm run build)
  base: '/marnthara-form/',
  build: {
    outDir: 'dist'
  },

  // การตั้งค่าสำหรับ Development (เมื่อสั่ง npm run dev)
  server: {
    port: 5173
  }
});