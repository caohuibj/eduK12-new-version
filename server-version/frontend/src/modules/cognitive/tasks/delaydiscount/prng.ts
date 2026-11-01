import type { DelaydiscountTrialPayload } from '../../types'

export interface DelaydiscountStimulus {
  delayDays: number
  delayedAmount: number
  immediateAmount: number
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

/** 延迟带呈现顺序：由 seed 决定的确定性洗牌；金额轨迹由选择驱动（组件内推进）。 */
export const buildDelaydiscountBandOrder = (seed: string, bandCount: number): number[] => {
  const random = mulberry32(xmur3(`${seed}:delaydiscount`)())
  const order: number[] = Array.from({ length: bandCount }, (_, index) => index)
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[order[index], order[swap]] = [order[swap], order[index]]
  }
  return order
}

/** 二分规则：当前上下界的四舍五入中点；与服务端评分轨迹复核一致。 */
export const immediateForBounds = (low: number, high: number): number => Math.round((low + high) / 2)

export const DELAYDISCOUNT_PRACTICE_TRIAL: DelaydiscountStimulus = { delayDays: 7, delayedAmount: 100, immediateAmount: 50 }
