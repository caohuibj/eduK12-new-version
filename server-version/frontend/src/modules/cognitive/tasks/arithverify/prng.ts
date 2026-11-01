import type { ArithverifyTrialPayload } from '../../types'

export interface ArithverifyStimulus {
  leftOperand: number
  rightOperand: number
  displayedResult: number
  isTrue: boolean
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

const DEVIATIONS = [-3, -2, -1, 1, 2, 3]

export const buildArithverifyTrials = (
  seed: string,
  totalTrials: number,
  operandMax: number,
  trueRatio: number
): ArithverifyStimulus[] => {
  const random = mulberry32(xmur3(`${seed}:arithverify`)())
  const trueCount = Math.round(totalTrials * trueRatio)
  const trials: ArithverifyStimulus[] = []
  for (let index = 0; index < trueCount; index += 1) {
    const leftOperand = 1 + Math.floor(random() * operandMax)
    const rightOperand = 1 + Math.floor(random() * operandMax)
    trials.push({ leftOperand, rightOperand, displayedResult: leftOperand + rightOperand, isTrue: true })
  }
  for (let index = trueCount; index < totalTrials; index += 1) {
    const leftOperand = 1 + Math.floor(random() * operandMax)
    const rightOperand = 1 + Math.floor(random() * operandMax)
    const sum = leftOperand + rightOperand
    const candidates = DEVIATIONS.map((deviation) => sum + deviation).filter((value) => value >= 0)
    const displayedResult = candidates[Math.floor(random() * candidates.length)]
    trials.push({ leftOperand, rightOperand, displayedResult, isTrue: false })
  }
  for (let index = trials.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[trials[index], trials[swap]] = [trials[swap], trials[index]]
  }
  return trials
}

export const ARITHVERIFY_PRACTICE_TRIALS: ArithverifyStimulus[] = [
  { leftOperand: 3, rightOperand: 4, displayedResult: 7, isTrue: true },
  { leftOperand: 6, rightOperand: 2, displayedResult: 9, isTrue: false },
]
