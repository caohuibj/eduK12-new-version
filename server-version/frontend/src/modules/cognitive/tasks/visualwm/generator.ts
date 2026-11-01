/** Visualwm shared generator (backend copy; identical mirror on the frontend). */

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

export const VISUALWM_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#14b8a6', '#ec4899'] as const
export const VISUALWM_COLOR_NAMES = ['红', '蓝', '绿', '黄', '紫', '橙', '青', '粉'] as const
export const VISUALWM_MAX_SET_SIZE = 6

export type VisualwmStimulus = {
  setSize: number
  colors: string[] // colors at each of the N positions on the circle
  probePosition: number // which position is probed (0..setSize-1)
  probeColor: string // the color shown at probe time (same or changed)
  isChange: boolean
}

/** 按 (seed, index) 生成一个变化觉察试次。setSize 在 3-6 之间循环。 */
export const visualwmTrial = (seed: string, index: number): VisualwmStimulus => {
  const random = mulberry32(xmur3(`${seed}:visualwm:trial:${index}`)())
  const setSize = 3 + (index % 4) // cycles 3,4,5,6
  const colorPool = shuffle([...VISUALWM_COLORS], random).slice(0, setSize)
  const probePosition = Math.floor(random() * setSize)
  const isChange = random() < 0.5
  let probeColor = colorPool[probePosition]
  if (isChange) {
    const otherColors = VISUALWM_COLORS.filter((c) => c !== colorPool[probePosition])
    probeColor = otherColors[Math.floor(random() * otherColors.length)]
  }
  return { setSize, colors: colorPool, probePosition, probeColor, isChange }
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}
