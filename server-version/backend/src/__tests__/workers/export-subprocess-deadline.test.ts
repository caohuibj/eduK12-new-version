import { afterEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
const mocks = vi.hoisted(() => ({ fork: vi.fn(), find: vi.fn(), fail: vi.fn() }))
vi.mock('node:child_process', () => ({ fork: mocks.fork }))
vi.mock('../../config/queue', () => ({ exportQueue: { process: vi.fn() }, RESOURCE_LIMITS: { exportConcurrency: 1, exportTimeout: 1 } }))
vi.mock('../../config/database', () => ({ prisma: { exportBatch: { findUnique: mocks.find } } }))
vi.mock('../../services/exportJobService', () => ({ failExportBatchFinal: mocks.fail, releaseExportBatchAttempt: vi.fn(), isFinalExportAttempt: () => true, reconcilePendingExportBatches: vi.fn().mockResolvedValue(0) }))
import { runExportSubprocess, stopExportProcessingRecovery } from '../../workers/exportProcessor'
import { activeWorkerSubprocessCount } from '../../workers/workerSubprocessRegistry'
afterEach(() => { stopExportProcessingRecovery(); vi.useRealTimers() })
it('kills deadline work but retains admission and shutdown tracking until OS process closure', async () => {
  vi.useFakeTimers()
  const child = Object.assign(new EventEmitter(), { kill: vi.fn(), send: vi.fn() })
  mocks.fork.mockReturnValue(child); mocks.find.mockResolvedValue({ id: 'batch', processingJobId: 'job', status: 'PROCESSING', generation: 3 })
  const done = runExportSubprocess({ id: 'job', data: { batchId: 'batch' }, opts: { attempts: 1 } })
  const result = expect(done).rejects.toThrow('deadline')
  expect(activeWorkerSubprocessCount()).toBe(1)
  await vi.advanceTimersByTimeAsync(1001)
  expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  expect(activeWorkerSubprocessCount()).toBe(1)
  child.emit('close', 1); await result
  expect(activeWorkerSubprocessCount()).toBe(0)
  expect(mocks.fail).toHaveBeenCalledWith('batch', 3, 'EXPORT_TIMEOUT')
})
