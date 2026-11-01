import type { RunningspanTrialPayload } from '../../types'

export interface RunningspanStimulus {
  sequence: string[]
}

const LETTERS = ['B', 'C', 'D', 'F', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'X']

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

/** 每试次随机长度（min..max）的字母序列，相邻不重复；长度随机化保证终点不可预知。 */
export const buildRunningspanSequences = (
  seed: string,
  totalTrials: number,
  listLengthMin: number,
  listLengthMax: number
): RunningspanStimulus[] => {
  const random = mulberry32(xmur3(`${seed}:runningspan`)())
  const trials: RunningspanStimulus[] = []
  for (let index = 0; index < totalTrials; index += 1) {
    const length = listLengthMin + Math.floor(random() * (listLengthMax - listLengthMin + 1))
    const sequence: string[] = []
    for (let position = 0; position < length; position += 1) {
      let letter = LETTERS[Math.floor(random() * LETTERS.length)]
      let guard = 0
      while (position > 0 && letter === sequence[position - 1] && guard < 16) {
        letter = LETTERS[Math.floor(random() * LETTERS.length)]
        guard += 1
      }
      sequence.push(letter)
    }
    trials.push({ sequence })
  }
  return trials
}

export const RUNNINGSPAN_LETTERS = LETTERS
export const RUNNINGSPAN_PRACTICE_SEQUENCE = ['D', 'N', 'R', 'T', 'X']
