export interface CheckinUploadCleanupConfig {
  batchSize: number
  intervalMs: number
  jitterMs: number
}

/** Per API process: at most 2 * batchSize candidates, serially, per sweep.
 * Separate from heavy media workers and from the other hourly maintenance jobs.
 * Defaults are a resource bound, not a measured capacity or durable-GC promise.
 */
export function resolveCheckinUploadCleanupConfig(env: NodeJS.ProcessEnv = process.env): CheckinUploadCleanupConfig {
  const integer = (name: string, fallback: number, min: number, max: number) => {
    const raw = env[name]
    if (raw === undefined) return fallback
    const value = Number(raw)
    if (!raw.trim() || !Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`${name} must be an integer between ${min} and ${max}`)
    }
    return value
  }
  return {
    batchSize: integer('CHECKIN_UPLOAD_CLEANUP_BATCH_SIZE', 10, 1, 25),
    intervalMs: integer('CHECKIN_UPLOAD_CLEANUP_INTERVAL_SECONDS', 300, 60, 3600) * 1000,
    jitterMs: integer('CHECKIN_UPLOAD_CLEANUP_JITTER_SECONDS', 30, 0, 60) * 1000,
  }
}
