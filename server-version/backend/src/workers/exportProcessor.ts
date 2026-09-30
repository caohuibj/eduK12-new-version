import { fork } from 'node:child_process'
import path from 'node:path'
import { exportQueue, RESOURCE_LIMITS } from '../config/queue'
import { prisma } from '../config/database'
import { failExportBatchFinal, releaseExportBatchAttempt, isFinalExportAttempt, reconcilePendingExportBatches } from '../services/exportJobService'
import { registerWorkerSubprocess } from './workerSubprocessRegistry'
import { logger } from '../utils/logger'
export const runExportSubprocess = (job: any): Promise<unknown> => new Promise((resolve, reject) => {
  const source = __filename.endsWith('.ts')
  const child = fork(path.join(__dirname, `exportBatchChild.${source ? 'ts' : 'js'}`), [], {
    execArgv: source ? ['--import', 'tsx'] : [], stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  })
  let result: unknown
  let failed = false
  let timedOut = false
  let settle!: () => void
  const settled = new Promise<void>(done => { settle = done })
  const unregister = registerWorkerSubprocess('assessment export', signal => child.kill(signal), settled)
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, RESOURCE_LIMITS.exportTimeout * 1000)
  child.on('message', (message: any) => { if (message?.ok) result = message.result; else failed = true })
  child.on('error', () => { failed = true })
  child.once('close', async code => {
    clearTimeout(timer); settle(); unregister()
    if (!timedOut && !failed && code === 0) return resolve(result)
    try {
      const batch = await prisma.exportBatch.findUnique({ where: { id: job.data.batchId } })
      if (batch?.processingJobId === String(job.id) && batch.status === 'PROCESSING') {
        if (isFinalExportAttempt(job)) await failExportBatchFinal(batch.id, batch.generation, timedOut ? 'EXPORT_TIMEOUT' : 'EXPORT_FAILED')
        else await releaseExportBatchAttempt(batch.id, batch.generation)
      }
    } catch { /* durable generation remains recoverable */ }
    reject(new Error(timedOut ? 'Export process deadline exceeded' : 'Export process failed'))
  })
  child.send({ data: job.data, id: String(job.id), opts: { attempts: job.opts.attempts }, attemptsMade: job.attemptsMade })
})
exportQueue.process(RESOURCE_LIMITS.exportConcurrency, runExportSubprocess)

let reconciliationStopped = false
const reconcile = () => {
  if (reconciliationStopped) return
  void reconcilePendingExportBatches().catch(() => {
    logger.error('导出 PROCESSING reconciliation 失败')
  })
}
const reconciliationStart = setTimeout(reconcile, 1_000)
const reconciliationInterval = setInterval(reconcile, 30_000)
reconciliationStart.unref?.()
reconciliationInterval.unref?.()

export const stopExportProcessingRecovery = (): void => {
  reconciliationStopped = true
  clearTimeout(reconciliationStart)
  clearInterval(reconciliationInterval)
}
