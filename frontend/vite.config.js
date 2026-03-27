import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/start-download': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/download-tile': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/end-download': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/task-status': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
