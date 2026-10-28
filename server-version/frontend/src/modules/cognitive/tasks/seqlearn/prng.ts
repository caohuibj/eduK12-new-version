import type { SeqlearnTrialPayload } from '../../types'

export interface SeqlearnStimulus {
  position: number
  isRandomBlock: boolean
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

/** 模式块按冻结序列取位；随机块由 seed 生成（服务端不校验随机块位置）。 */
export const buildSeqlearnPositions = (
  seed: string,
  totalTrials: number,
  trialsPerBlock: number,
  patternSequence: number[],
  randomBlockIndices: number[]
): SeqlearnStimulus[] => {
  const random = mulberry32(xmur3(`${seed}:seqlearn`)())
  const randomBlocks = new Set(randomBlockIndices)
  return Array.from({ length: totalTrials }, (_, index) => {
    const block = Math.floor(index / trialsPerBlock) + 1
    if (randomBlocks.has(block)) {
      return { position: 1 + Math.floor(random() * 4), isRandomBlock: true }
    }
    return { position: patternSequence[index % patternSequence.length], isRandomBlock: false }
  })
}

export const SEQLEARN_PRACTICE_POSITIONS = [2, 3, 1, 4]
