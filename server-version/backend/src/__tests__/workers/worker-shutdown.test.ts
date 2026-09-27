import { describe, expect, it, vi } from 'vitest'
import { shutdownWorkerRuntime } from '../../workers/workerShutdown'

describe('worker shutdown orchestration', () => {
  it('pauses before draining, cancels subprocesses, closes queues, then disconnects DB', async () => {
    const order: string[] = []
    let activeReads = 0
    const result = await shutdownWorkerRuntime({
      pauseConsumers: async () => { order.push('pause') },
      activeCounts: async () => {
        order.push('active')
        activeReads += 1
        return activeReads < 3 ? { video: 1, image: 0, export: 0 } : { video: 0, image: 0, export: 0 }
      },
      cancelSubprocesses: async () => { order.push('cancel'); return { remaining: 0 } },
      activeSubprocessCount: () => 1,
      closeQueues: async (forced) => { order.push(`close:${Boolean(forced)}`) },
      disconnectDatabase: async () => { order.push('db') },
      sleep: async () => undefined,
      now: (() => {
        let now = 0
        return () => (now += 100)
      })(),
    }, 2_000)

    expect(result).toEqual({ activeJobs: 0, subprocessesRemaining: 0, forcedQueueClose: false, failed: false })
    expect(order[0]).toBe('pause')
    expect(order).toContain('cancel')
    expect(order.indexOf('cancel')).toBeLessThan(order.indexOf('close:false'))
    expect(order.indexOf('close:false')).toBeLessThan(order.indexOf('db'))
  })

  it('forces Bull close only after the bounded deadline and still disconnects DB', async () => {
    const closeQueues = vi.fn(async () => undefined)
    const disconnectDatabase = vi.fn(async () => undefined)
    let now = 0
    const result = await shutdownWorkerRuntime({
      pauseConsumers: async () => undefined,
      activeCounts: async () => ({ video: 1, image: 1, export: 1 }),
      cancelSubprocesses: async () => ({ remaining: 0 }),
      activeSubprocessCount: () => 0,
      closeQueues,
      disconnectDatabase,
      sleep: async () => undefined,
      now: () => (now += 1_000),
    }, 2_500)

    expect(result.activeJobs).toBe(3)
    expect(result.forcedQueueClose).toBe(true)
    expect(closeQueues).toHaveBeenCalledWith(true)
    expect(disconnectDatabase).toHaveBeenCalledOnce()
  })
})
