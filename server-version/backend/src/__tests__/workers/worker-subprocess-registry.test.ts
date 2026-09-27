import { describe, expect, it, vi } from 'vitest'

describe('worker subprocess registry', () => {
  it('sends TERM then KILL and waits for the tracked process to settle', async () => {
    vi.resetModules()
    const registry = await import('../../workers/workerSubprocessRegistry')
    const signals: string[] = []
    let settle!: () => void
    const settled = new Promise<void>((resolve) => { settle = resolve })
    const unregister = registry.registerWorkerSubprocess('fixture', (signal) => {
      signals.push(signal)
      if (signal === 'SIGKILL') settle()
    }, settled)

    const result = await registry.cancelActiveWorkerSubprocesses(20)
    unregister()
    expect(signals[0]).toBe('SIGTERM')
    expect(signals).toContain('SIGKILL')
    expect(result.remaining).toBe(0)
    expect(registry.activeWorkerSubprocessCount()).toBe(0)
  })
})
