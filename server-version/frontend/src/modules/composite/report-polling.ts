/** A visible page sends at most 24 automatic status probes per cycle. */
export const REPORT_AUTO_POLL_LIMIT = 24
export const reportPollingDelayMs = (pollCount: number, retryAfterSeconds: number, random = Math.random, profile: 'FAST_START' | 'QUEUED' | 'LEGACY' = 'QUEUED'): number => {
  const early = profile === 'FAST_START' && pollCount < 4
  const base = early ? [400, 400, 800, 1600][pollCount]
    : profile === 'LEGACY' ? pollCount === 0 ? 2000 : pollCount < 3 ? 5000 : 10000
      : pollCount < 8 ? 2500 : 4000
  const floor = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 0
  const sample = random()
  const jitter = Number.isFinite(sample) ? Math.floor(Math.min(1, Math.max(0, sample)) * (early ? 50 : 500)) : 0
  return Math.max(base, floor) + jitter
}
