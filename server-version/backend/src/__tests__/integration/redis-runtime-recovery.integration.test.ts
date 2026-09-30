import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:http'
const container = process.env.PRELAUNCH_REDIS_FAULT_CONTAINER
const suite = container ? describe : describe.skip
suite('project Redis runtime outage/recovery', () => {
  it('recovers cache/shared limiter, Socket adapter and the configured export queue without process restart', async () => {
    if (!container?.startsWith('huisurvey-prelaunch-redis-fault')) throw new Error('Requires a dedicated disposable fault container')
    const run = promisify(execFile)
    const { cacheService } = await import('../../services/cacheService')
    const { SocketService } = await import('../../services/socketService')
    const { exportQueue, imageQueue, videoQueue } = await import('../../config/queue')
    const socket = new SocketService(); const server = createServer()
    for (const queue of [exportQueue, imageQueue, videoQueue]) queue.on('error', () => undefined)
    try {
      await cacheService.initialize(); await socket.initialize(server)
      await exportQueue.isReady()
      exportQueue.process('prelaunch-recovery-probe', 1, async job => job.data)
      const before = await exportQueue.add('prelaunch-recovery-probe', { phase: 'before' })
      expect(await before.finished()).toEqual({ phase: 'before' })
      await run('docker', ['stop', '-t', '1', container])
      await expect.poll(() => cacheService.getStatus().connected, { timeout: 10000 }).toBe(false)
      await expect.poll(() => socket.getRedisState(), { timeout: 10000 }).not.toBe('ready')
      expect(await cacheService.consumeRateLimit('prelaunch-recovery-probe', 10, 60)).toBeNull()
      await run('docker', ['start', container])
      await expect.poll(() => cacheService.getStatus().connected, { timeout: 20000 }).toBe(true)
      await expect.poll(() => socket.getRedisState(), { timeout: 20000 }).toBe('ready')
      expect(await cacheService.consumeRateLimit('prelaunch-recovery-probe', 10, 60)).toMatchObject({ allowed: true })
      const after = await exportQueue.add('prelaunch-recovery-probe', { phase: 'after' })
      expect(await after.finished()).toEqual({ phase: 'after' })
    } finally {
      await run('docker', ['start', container]).catch(() => undefined)
      await Promise.all([cacheService.close(), socket.close(), exportQueue.close(), imageQueue.close(), videoQueue.close()])
    }
  }, 60000)
})
