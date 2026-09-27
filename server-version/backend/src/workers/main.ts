import { config } from '../config'
import { startBackgroundWorkers } from '../config/backgroundWorkers'
import { prisma } from '../config/database'
import { activeQueueJobCounts, closeQueues, pauseQueueConsumers } from '../config/queue'
import { effectiveRuntimeResourceConfig, runtimeResourceConfig } from '../config/runtimeResources'
import { logger } from '../utils/logger'
import { activeWorkerSubprocessCount, cancelActiveWorkerSubprocesses } from './workerSubprocessRegistry'
import { shutdownWorkerRuntime } from './workerShutdown'

/**
 * Media/export consumer process. This entrypoint must not open HTTP, Socket.IO,
 * or API middleware. API processes enqueue jobs; this process is the only
 * canonical Compose consumer when BACKGROUND_WORKERS_ENABLED=false on backend.
 */
let shutdownStarted = false

const gracefulShutdown = async (signal: string, exitCode = 0) => {
  if (shutdownStarted) return
  shutdownStarted = true

  logger.info(`${signal} received: stopping background workers`, {
    shutdownTimeoutSeconds: runtimeResourceConfig.workerShutdownTimeoutSeconds,
  })

  const result = await shutdownWorkerRuntime({
    pauseConsumers: pauseQueueConsumers,
    activeCounts: activeQueueJobCounts,
    cancelSubprocesses: cancelActiveWorkerSubprocesses,
    activeSubprocessCount: activeWorkerSubprocessCount,
    closeQueues,
    disconnectDatabase: () => prisma.$disconnect(),
  }, runtimeResourceConfig.workerShutdownTimeoutSeconds * 1000)

  if (result.activeJobs > 0 || result.subprocessesRemaining > 0) {
    logger.warn('Worker shutdown reached its bounded deadline; unfinished Bull jobs will recover by retry/stall reconciliation', result)
    exitCode = exitCode || 1
  }
  if (result.failed) exitCode = exitCode || 1
  process.exit(exitCode)
}

process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM') })
process.on('SIGINT', () => { void gracefulShutdown('SIGINT') })
process.on('uncaughtException', (err) => {
  logger.error('Worker uncaught exception, process will exit', err)
  void gracefulShutdown('uncaughtException', 1)
})
process.on('unhandledRejection', (reason) => {
  logger.error('Worker unhandled rejection, process will exit', reason)
  void gracefulShutdown('unhandledRejection', 1)
})

const startWorker = async (): Promise<void> => {
  if (config.nodeEnv === 'production' && !config.assetMigrationComplete) {
    throw new Error('ASSET_MIGRATION_COMPLETE=true is required before starting production workers')
  }
  logger.info('Effective worker resource config', effectiveRuntimeResourceConfig())
  const started = await startBackgroundWorkers(true)
  if (started !== 'started') throw new Error('worker process must start video/image/export consumers')
  logger.info('Background worker process is consuming video/image/export jobs')
}

void startWorker().catch((error) => {
  logger.error('Worker failed to start, process will exit', error)
  void gracefulShutdown('startup failure', 1)
})
