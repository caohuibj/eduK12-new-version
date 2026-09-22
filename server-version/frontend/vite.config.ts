import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Both local development and built-browser acceptance use the same API routes.
// CI defaults to its isolated backend on port 3000; local isolated tests can override it.
const backendTarget = process.env.E2E_BACKEND_URL || 'http://localhost:3000'
const proxy = {
  '/api': { target: backendTarget, changeOrigin: true, secure: false },
  '/uploads': { target: backendTarget, changeOrigin: true, secure: false },
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy,
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy,
  },
  build: {
    outDir: 'dist',
  },
})
