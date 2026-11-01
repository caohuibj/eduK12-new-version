/** Auditoryrt shared generator (backend copy; identical mirror on the frontend).
 * 前瞻期（foreperiod）抖动调度：均匀取值于 [foreperiodMinMs, foreperiodMaxMs]，
 * 且避免与前一次完全相同，抑制节奏性预期反应。
 */

function xmur3(value: string): () => number {
  let hash = 1779033703 ^ value.length
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353)
    hash = (hash << 13) | (hash >>> 19)
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507)
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909)
    hash ^= hash >>> 16
    return hash >>> 0
  }
}

function mulberry32(seed: number): () => number {
  let value = seed | 0
  return () => {
    value = (value + 0x6d2b79f5) | 0
    let t = Math.imul(value ^ (value >>> 15), 1 | value)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const generateAuditoryRtForeperiods = (
  seed: string,
  totalTrials: number,
  foreperiodMinMs: number,
  foreperiodMaxMs: number,
): number[] => {
  const random = mulberry32(xmur3(`${seed}:auditoryrt`)())
  const periods: number[] = []
  let previous = -1
  for (let index = 0; index < totalTrials; index += 1) {
    let value = foreperiodMinMs
    do {
      value = foreperiodMinMs + Math.floor(random() * (foreperiodMaxMs - foreperiodMinMs + 1))
    } while (value === previous && foreperiodMaxMs > foreperiodMinMs)
    periods.push(value)
    previous = value
  }
  return periods
}
