import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Both local development and built-browser acceptance use the same API routes.
// CI defaults to its isolated backend on port 3000; local isolated tests can override it.
const backendTarget = process.env.E2E_BACKEND_URL || 'http://localhost:3000'
const proxy = {
  '/api': { target: backendTarget, changeOrigin: true, secure: false },
  '/uploads': { target: backendTarget, changeOrigin: true, secure: false },
  '/socket.io': { target: backendTarget, ws: true },
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Product-host browser fixtures resolve these exact hosts to loopback.
    allowedHosts: ['eduk12.top', 'www.eduk12.top', 'training.eduk12.top', 'survey.eduk12.top', 'school.eduk12.top', 'teacher.eduk12.top'],
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
    ...(process.env.P6_PACKAGE_PROBE_BUILD==='true'?{rollupOptions:{input:['index.html','p6-package-probe.html']}}:{}),
  },
})
