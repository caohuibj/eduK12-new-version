import type { StroopColor, StroopTrialPayload } from '../../types'

export type StroopWord = StroopTrialPayload['word']

export interface StroopStimulus {
  word: StroopWord
  inkColor: StroopColor
}

const COLORS: StroopColor[] = ['red', 'green', 'blue', 'yellow']
const WORDS: Record<StroopColor, StroopWord> = { red: '红', green: '绿', blue: '蓝', yellow: '黄' }

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

export const buildStroopTrials = (seed: string, totalTrials: number, congruentRatio: number): StroopStimulus[] => {
  const random = mulberry32(xmur3(`${seed}:stroop`)())
  const congruentCount = Math.round(totalTrials * congruentRatio)
  const trials: StroopStimulus[] = []
  for (let index = 0; index < congruentCount; index += 1) {
    const color = COLORS[Math.floor(random() * COLORS.length)]
    trials.push({ word: WORDS[color], inkColor: color })
  }
  for (let index = congruentCount; index < totalTrials; index += 1) {
    const wordColor = COLORS[Math.floor(random() * COLORS.length)]
    let inkColor = COLORS[Math.floor(random() * COLORS.length)]
    while (inkColor === wordColor) inkColor = COLORS[Math.floor(random() * COLORS.length)]
    trials.push({ word: WORDS[wordColor], inkColor })
  }
  for (let index = trials.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[trials[index], trials[swapIndex]] = [trials[swapIndex], trials[index]]
  }
  return trials
}
