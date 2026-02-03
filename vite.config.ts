import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },

  // ✅ 新增這一段（關鍵）
  server: {
    proxy: {
      // 1. 專門給 OCR 服務 (8083)
      '/api/ocr_process': {
        target: 'http://140.115.54.241:8083',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/ocr_process/, '/ocr'),
      },
      // 2. 專門給 YOLO 預測服務 (8082)
      '/api/predict': {
        target: 'http://140.115.54.239:8082',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/predict/, '/predict'),
      },

      //針對 Google OCR 的代理設定
      '/ocr_google': {
        // 原本寫錯成 8082，請改成 8083 (因為 api.py 是跑在 8083)
        target: 'http://140.115.54.241:8083', 
        changeOrigin: true,
        secure: false, // 建議加上這行，避免 HTTPS 憑證問題（雖然你是 HTTP）
      }
    },
  },
})
