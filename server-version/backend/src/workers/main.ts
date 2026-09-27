import { config } from '../config'
import { startBackgroundWorkers } from '../config/backgroundWorkers'
import { prisma } from '../config/database'
import { activeQueueJobCounts, closeQueues, pauseQueueConsumers } from '../config/queue'
import { effectiveRuntimeResourceConfig, runtimeResourceConfig } from '../config/runtimeResources'
import { logger } from '../utils/logger'
import { activeWorkerSubprocessCount, cancelActiveWorkerSubprocesses } from './workerSubprocessRegistry'

/**
 * Media/export consumer process. This entrypoint must not open HTTP, Socket.IO,
 * or API middleware. API processes enqueue jobs; this process is the only
 * canonical Compose consumer when BACKGROUND_WORKERS_ENABLED=false on backend.
 */
let shutdownStarted = false

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const totalActive = (counts: { video: number; image: number; export: number }) =>
  counts.video + counts.image + counts.export

const waitForDrain = async (deadline: number): Promise<number> => {
  let active = totalActive(await activeQueueJobCounts())
  while (active > 0 && Date.now() < deadline) {
    await sleep(100)
    active = totalActive(await activeQueueJobCounts())
  }
  return active
}

const gracefulShutdown = async (signal: string, exitCode = 0) => {
  if (shutdownStarted) return
  shutdownStarted = true

  const timeoutMs = runtimeResourceConfig.workerShutdownTimeoutSeconds * 1000
  const deadline = Date.now() + timeoutMs
  logger.info(`${signal} received: stopping background workers`, {
    shutdownTimeoutSeconds: runtimeResourceConfig.workerShutdownTimeoutSeconds,
  })

  let activeJobs = 0
  let subprocessesRemaining = 0
  try {
    await pauseQueueConsumers()

    // Give ordinary bounded image/export work an initial drain window. Reserve
    // at least half of the shutdown budget for cancelling/settling subprocesses
    // and closing connections.
    const drainDeadline = Math.min(deadline, Date.now() + Math.floor(timeoutMs / 2))
    activeJobs = await waitForDrain(drainDeadline)

    if (activeJobs > 0 || activeWorkerSubprocessCount() > 0) {
      const remainingForCancellation = Math.max(1, deadline - Date.now())
      const cancelled = await cancelActiveWorkerSubprocesses(remainingForCancellation)
      subprocessesRemaining = cancelled.remaining
      activeJobs = await waitForDrain(deadline)
    }

    const doNotWaitJobs = activeJobs > 0
    await closeQueues(doNotWaitJobs)
  } catch (error) {
    logger.error('Worker shutdown queue/cancellation phase failed', error)
    exitCode = exitCode || 1
  }

  try {
    await prisma.$disconnect()
  } catch (error) {
    logger.error('Worker Prisma disconnect failed', error)
    exitCode = exitCode || 1
  }

  if (activeJobs > 0 || subprocessesRemaining > 0) {
    logger.warn('Worker shutdown reached its bounded deadline; unfinished Bull jobs will recover by retry/stall reconciliation', {
      activeJobs,
      subprocessesRemaining,
    })
    exitCode = exitCode || 1
  }
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
