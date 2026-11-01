import type { SizecongruityTrialPayload } from '../../types'

export type SizecongruitySide = 'left' | 'right'
export type SizecongruityFontScale = 'large' | 'small'

export interface SizecongruityStimulus {
  leftDigit: number
  rightDigit: number
  leftFontScale: SizecongruityFontScale
  rightFontScale: SizecongruityFontScale
}

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

/**
 * 生成数值间距 ≥ minGap 的数对，并按 congruentRatio 分配一致/不一致条件；
 * 数值较大侧随机分到左右，保持位置平衡。
 */
export const buildSizecongruityTrials = (
  seed: string,
  totalTrials: number,
  congruentRatio: number,
  minDigit: number,
  maxDigit: number,
  minGap: number
): SizecongruityStimulus[] => {
  const random = mulberry32(xmur3(`${seed}:sizecongruity`)())
  const congruentCount = Math.round(totalTrials * congruentRatio)
  const trials: SizecongruityStimulus[] = []
  for (let index = 0; index < totalTrials; index += 1) {
    const congruent = index < congruentCount ? true : false
    const smallDigit = minDigit + Math.floor(random() * (maxDigit - minDigit + 1 - minGap))
    const largeDigit = smallDigit + minGap + Math.floor(random() * (maxDigit - minGap - smallDigit + 1))
    const largerOnLeft = random() < 0.5
    const leftDigit = largerOnLeft ? largeDigit : smallDigit
    const rightDigit = largerOnLeft ? smallDigit : largeDigit
    const largeOnLeft = congruent ? largerOnLeft : !largerOnLeft
    trials.push({
      leftDigit,
      rightDigit,
      leftFontScale: largeOnLeft ? 'large' : 'small',
      rightFontScale: largeOnLeft ? 'small' : 'large',
    })
  }
  const order: number[] = trials.map((_, index) => index)
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[order[index], order[swap]] = [order[swap], order[index]]
  }
  return order.map((index) => trials[index])
}

export const SIZECONGRUITY_PRACTICE_TRIALS: SizecongruityStimulus[] = [
  { leftDigit: 7, rightDigit: 3, leftFontScale: 'large', rightFontScale: 'small' },
  { leftDigit: 7, rightDigit: 3, leftFontScale: 'small', rightFontScale: 'large' },
]
