import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// jsdom has no top layer. Browser tests verify actual modal inertness; these
// minimal methods allow component lifecycle and keyboard tests to run here.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
}

// globals:false 时 RTL 不会自动挂 afterEach → 显式 cleanup，避免跨测试 DOM 泄漏
afterEach(() => {
  cleanup()
})
