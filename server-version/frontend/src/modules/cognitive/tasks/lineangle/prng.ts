import type { LineangleTrialPayload } from '../../types'

export interface LineangleStimulus {
  targetAngle: number
  optionAngles: number[]
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

/** 角度池：0..180 按 step 步进。 */
export const anglePool = (stepDeg: number): number[] => {
  const pool: number[] = []
  for (let angle = 0; angle <= 180; angle += stepDeg) pool.push(angle)
  return pool
}

/** 生成目标 + 满足最小间隔的干扰项，并随机排列选项。 */
export const buildLineangleTrials = (
  seed: string,
  totalTrials: number,
  angleStepDeg: number,
  optionCount: number,
  minAngleSepSteps: number
): LineangleStimulus[] => {
  const random = mulberry32(xmur3(`${seed}:lineangle`)())
  const pool = anglePool(angleStepDeg)
  const trials: LineangleStimulus[] = []
  for (let index = 0; index < totalTrials; index += 1) {
    const targetIndex = Math.floor(random() * pool.length)
    const targetAngle = pool[targetIndex]
    const candidates = pool.filter((_, poolIndex) => Math.abs(poolIndex - targetIndex) >= minAngleSepSteps)
    const distractors: number[] = []
    while (distractors.length < optionCount - 1 && candidates.length > 0) {
      const pickIndex = Math.floor(random() * candidates.length)
      const pick = candidates.splice(pickIndex, 1)[0]
      distractors.push(pick)
    }
    const options = [targetAngle, ...distractors]
    for (let swap = options.length - 1; swap > 0; swap -= 1) {
      const swapIndex = Math.floor(random() * (swap + 1))
      ;[options[swap], options[swapIndex]] = [options[swapIndex], options[swap]]
    }
    trials.push({ targetAngle, optionAngles: options })
  }
  return trials
}

export type LineangleResponse = LineangleTrialPayload['responseAngle']

/** Unoriented line axes have period 180 degrees; v1 remains frozen above. */
export const axisAngle = (angle: number): number => ((angle % 180) + 180) % 180
export const axisDistance = (a: number, b: number): number => {
  const distance = Math.abs(axisAngle(a) - axisAngle(b))
  return Math.min(distance, 180 - distance)
}
export const buildLineangleTrialsV2 = (seed: string, totalTrials: number, step: number, count: number, separation: number): LineangleStimulus[] => {
  const pool = anglePool(step).filter(angle => angle < 180)
  const random = mulberry32(xmur3(`${seed}:lineangle-axis-v2`)())
  return Array.from({ length: totalTrials }, () => {
    const targetAngle = pool[Math.floor(random() * pool.length)]
    const candidates = pool.filter(angle => angle !== targetAngle && axisDistance(angle, targetAngle) >= step * separation)
    if (candidates.length < count - 1) throw new Error('线段角度设置无法提供足够的不同方向选项')
    const optionAngles = [targetAngle]
    while (optionAngles.length < count) optionAngles.push(candidates.splice(Math.floor(random() * candidates.length), 1)[0])
    for (let index = optionAngles.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1))
      ;[optionAngles[index], optionAngles[other]] = [optionAngles[other], optionAngles[index]]
    }
    return { targetAngle, optionAngles }
  })
}
