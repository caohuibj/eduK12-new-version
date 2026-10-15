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
  if (raw === undefined) return env.NODE_ENV !== 'test'
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new Error(`❌ BACKGROUND_WORKERS_ENABLED must be 'true' or 'false' (got '${raw}')`)
}

/** Video uploads/transcoding are a manually confirmed, idle NIGHT operation.
 * Keep video consumers off during daytime answer/report traffic. No scheduler
 * can infer that thinking participants are idle from an empty job queue.
 */
export const resolveVideoProcessingEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => {
  const enabled = env.VIDEO_PROCESSING_ENABLED ?? 'false'
  if (!['true', 'false'].includes(enabled)) throw new Error('VIDEO_PROCESSING_ENABLED must be true or false')
  return enabled === 'true' && env.VIDEO_MAINTENANCE_IDLE_CONFIRMED === 'true'
}

export const resolveHeavyProcessingEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => {
  const enabled = env.HEAVY_PROCESSING_ENABLED ?? 'false'
  if (!['true', 'false'].includes(enabled)) throw new Error('HEAVY_PROCESSING_ENABLED must be true or false')
  return enabled === 'true' && env.HEAVY_MAINTENANCE_IDLE_CONFIRMED === 'true'
}

const loadBackgroundWorkers = async (): Promise<void> => {
  if (!resolveHeavyProcessingEnabled()) {
    logger.info('Heavy media/export consumers are paused; report processing remains independent')
    return
  }
  await Promise.all([
    ...(resolveVideoProcessingEnabled() ? [import('../workers/videoProcessorOptimized')] : []),
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
