/** Read a monotonic browser clock for elapsed Scale response timing. */
export const readScaleTimingNow = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

/** Convert a measured elapsed interval to the existing integer responseTimeMs contract. */
export const elapsedScaleResponseTimeMs = (start: number, end: number): number => {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.round(end - start))
}
