import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/')) {
            if (
              id.includes('/node_modules/react/') ||
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/react-router')
            ) {
              return 'vendor-react'
            }
            if (id.includes('/node_modules/antd/') || id.includes('/node_modules/@ant-design/')) {
              return 'vendor-antd'
            }
            return 'vendor'
          }

          if (id.includes('/src/modules/cognitive/')) return 'cognitive'
          if (id.includes('/src/modules/reporting/') || id.includes('/src/modules/composite/')) return 'reports'
          return undefined
        },
      },
    },
  },
})
