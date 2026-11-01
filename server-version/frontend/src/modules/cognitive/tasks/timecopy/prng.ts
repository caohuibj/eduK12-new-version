import type { TimecopyTrialPayload } from '../../types'

export interface TimecopyStimulus {
  targetMs: number
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

/** 分层生成目标间隔：把 [min,max] 均分成 totalTrials 段，每段内随机取值后洗牌。 */
export const buildTimecopyTargets = (seed: string, totalTrials: number, targetMinMs: number, targetMaxMs: number): TimecopyStimulus[] => {
  const random = mulberry32(xmur3(`${seed}:timecopy`)())
  const span = targetMaxMs - targetMinMs
  const targets: number[] = []
  for (let index = 0; index < totalTrials; index += 1) {
    const low = targetMinMs + Math.round((span * index) / totalTrials)
    const high = Math.max(low, targetMinMs + Math.round((span * (index + 1)) / totalTrials))
    targets.push(low + Math.floor(random() * (high - low + 1)))
  }
  for (let index = targets.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[targets[index], targets[swap]] = [targets[swap], targets[index]]
  }
  return targets.map((targetMs) => ({ targetMs }))
}

export const TIMECOPY_PRACTICE_TARGET = 1500
