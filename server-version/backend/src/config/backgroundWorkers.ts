import { logger } from '../utils/logger'

/**
 * Media transcode, image compression, and assessment-export consumers share
 * this process's Prisma pool and CPU. Assessment-only 4C/4G boxes should turn
 * them off so FINAL_ONLY submit cannot wait behind a stale-video sweep.
 *
 * Default: on in development/production (current behavior), off in test.
 */
export const resolveBackgroundWorkersEnabled = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => {
  const raw = env.BACKGROUND_WORKERS_ENABLED
  if (raw === undefined || raw === '') return env.NODE_ENV !== 'test'
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new Error(`❌ BACKGROUND_WORKERS_ENABLED must be 'true' or 'false' (got '${raw}')`)
}

const loadBackgroundWorkers = async (): Promise<void> => {
  await Promise.all([
    import('../workers/videoProcessorOptimized'),
    import('../workers/exportProcessor'),
    import('../workers/imageProcessor'),
  ])
}

export const startBackgroundWorkers = async (
  enabled: boolean = resolveBackgroundWorkersEnabled(),
  load: () => Promise<void> = loadBackgroundWorkers,
): Promise<'started' | 'skipped'> => {
  if (!enabled) {
    logger.info('Background media/export workers are disabled for this process')
    return 'skipped'
  }
  await load()
  return 'started'
}
