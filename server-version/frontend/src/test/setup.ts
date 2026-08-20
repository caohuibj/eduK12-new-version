import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// globals:false 时 RTL 不会自动挂 afterEach → 显式 cleanup，避免跨测试 DOM 泄漏
afterEach(() => {
  cleanup()
})
