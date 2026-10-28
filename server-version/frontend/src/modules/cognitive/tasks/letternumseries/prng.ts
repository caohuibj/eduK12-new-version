import type { LetternumseriesTrialPayload } from '../../types'

export interface LetternumseriesStimulus {
  sequence: string[]
}

const LETTER_POOL = ['B', 'D', 'F', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T']
const DIGIT_POOL = ['2', '3', '4', '5', '6', '7', '8', '9']

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

const shuffle = <T,>(items: T[], random: () => number): T[] => {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

/** 每试次：lettersPerTrial 个不重复字母 + digitsPerTrial 个不重复数字，混合顺序。 */
export const buildLetternumseriesSequences = (
  seed: string,
  totalTrials: number,
  lettersPerTrial: number,
  digitsPerTrial: number
): LetternumseriesStimulus[] => {
  const random = mulberry32(xmur3(`${seed}:letternumseries`)())
  const trials: LetternumseriesStimulus[] = []
  for (let index = 0; index < totalTrials; index += 1) {
    const letters = shuffle(LETTER_POOL, random).slice(0, lettersPerTrial)
    const digits = shuffle(DIGIT_POOL, random).slice(0, digitsPerTrial)
    const mixed = shuffle([...letters, ...digits], random)
    trials.push({ sequence: mixed })
  }
  return trials
}

export const LETTERNUMSERIES_PRACTICE_SEQUENCE = ['D', '6', 'K', '2', 'M']
