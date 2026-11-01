/** Ufov shared generator (backend copy; identical mirror on the frontend). */

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

export type UfovStimulus = {
  centralTarget: 'circle' | 'triangle'
  peripheralPosition: number // 0-7, 45° intervals clockwise from top
}

/** 8 个周边位置的角度（正上方为 0，顺时针 45° 步进）。 */
export const UFOV_POSITIONS = [0, 1, 2, 3, 4, 5, 6, 7] as const

export const ufovStimulus = (seed: string, trialIndex: number): UfovStimulus => {
  const random = mulberry32(xmur3(`${seed}:ufov:trial:${trialIndex}`)())
  return {
    centralTarget: random() < 0.5 ? 'circle' : 'triangle',
    peripheralPosition: Math.floor(random() * 8),
  }
}
