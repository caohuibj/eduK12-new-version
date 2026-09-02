import { config } from '../config'
import { startBackgroundWorkers } from '../config/backgroundWorkers'
import { prisma } from '../config/database'
import { closeQueues } from '../config/queue'
import { logger } from '../utils/logger'

/**
 * Media/export consumer process. This entrypoint must not open HTTP, Socket.IO,
 * or API middleware. API processes enqueue jobs; this process is the only
 * canonical Compose consumer when BACKGROUND_WORKERS_ENABLED=false on backend.
 */
let shutdownStarted = false

const gracefulShutdown = async (signal: string, exitCode = 0) => {
  if (shutdownStarted) return
  shutdownStarted = true
  logger.info(`${signal} received: stopping background workers`)
  const forceExit = setTimeout(() => {
    logger.warn('Forced worker exit after timeout')
    process.exit(exitCode || 1)
  }, 5000)
  await Promise.allSettled([
    closeQueues(),
    prisma.$disconnect(),
  ])
  clearTimeout(forceExit)
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
  const started = await startBackgroundWorkers(true)
  if (started !== 'started') {
    throw new Error('worker process must start video/image/export consumers')
  }
  logger.info('Background worker process is consuming video/image/export jobs')
}

void startWorker().catch((error) => {
  logger.error('Worker failed to start, process will exit', error)
  void gracefulShutdown('startup failure', 1)
})
