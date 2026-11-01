import type { NumberlineTrialPayload } from '../../types'

export const NUMBERLINE_PRACTICE_TARGET = 37 as NumberlineTrialPayload['targetNumber']
export interface NumberlineStimulus {
  targetNumber: number
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
 * 分层生成目标数：把 0..lineMax 均分成 totalTrials 个区间，每区间内随机取一个
 * 非端点整数，保证整条线段的覆盖均匀且顺序随机。
 */
export const buildNumberlineTargets = (seed: string, totalTrials: number, lineMax: number): NumberlineStimulus[] => {
  const random = mulberry32(xmur3(`${seed}:numberline`)())
  const segment = lineMax / totalTrials
  const targets: number[] = []
  for (let index = 0; index < totalTrials; index += 1) {
    const low = Math.min(Math.round(index * segment), lineMax - 1)
    const high = Math.max(low + 1, Math.min(Math.round((index + 1) * segment), lineMax))
    let candidate = low + Math.floor(random() * (high - low + 1))
    candidate = Math.min(lineMax - 1, Math.max(1, candidate))
    targets.push(candidate)
  }
  const order: number[] = targets.map((_, index) => index)
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[order[index], order[swap]] = [order[swap], order[index]]
  }
  return order.map((index) => ({ targetNumber: targets[index] }))
}
