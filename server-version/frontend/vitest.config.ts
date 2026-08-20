import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Stage B（v1.1 §10）：前端最小测试基础设施。
// 与 vite.config.ts 分离，互不影响 `vite build`；只跑 Cognitive 模块测试。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false, // 测试内显式 import { describe, it, expect } from 'vitest'
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/modules/cognitive/**/*.test.{ts,tsx}'],
  },
})
