import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/

export default defineConfig({
  plugins: [react()],
  base: '/free_form_web/',
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true } }
  }
})