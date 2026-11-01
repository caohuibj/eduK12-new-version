/**
 * Cancellation shared generator (backend copy; identical mirror on the
 * frontend). Each scan is a symbol grid generated from (seed, scanIndex):
 * a target symbol fills targetCount cells, the rest draw from a
 * shape-similar distractor pool. Symbols are unicode, no assets.
 */
export const CANCELLATION_STIMULUS_SET_VERSION = 'cancellation-zh-v1.0.0'

export const CANCELLATION_GRID_COLS = 10
export const CANCELLATION_GRID_ROWS = 8
export const CANCELLATION_GRID_SIZE = CANCELLATION_GRID_COLS * CANCELLATION_GRID_ROWS
export const CANCELLATION_TARGET_COUNT = 16

/** 目标符号池（逐轮抽取一个目标）；干扰项为形状相近的符号。 */
export const CANCELLATION_TARGETS = ['Q', 'R', 'F', 'P'] as const
export type CancellationTarget = (typeof CANCELLATION_TARGETS)[number]

const DISTRACTOR_POOL: Record<CancellationTarget, string[]> = {
  Q: ['O', 'D', 'G', 'C', 'U', '0'],
  R: ['B', 'P', 'F', 'K', 'E', 'H'],
  F: ['E', 'T', 'P', 'H', 'L', 'I'],
  P: ['R', 'B', 'F', 'D', 'G', 'H'],
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

export type CancellationScan = {
  scanIndex: number
  target: CancellationTarget
  grid: string[] // length = GRID_SIZE, row-major
  targetCells: number[]
}

/** 按 (seed, scanIndex) 重建一轮划消网格。 */
export const cancellationScan = (seed: string, scanIndex: number): CancellationScan => {
  const random = mulberry32(xmur3(`${seed}:cancellation:scan:${scanIndex}`)())
  const target = CANCELLATION_TARGETS[scanIndex % CANCELLATION_TARGETS.length]
  const distractors = DISTRACTOR_POOL[target]
  const targetCells = new Set<number>()
  while (targetCells.size < CANCELLATION_TARGET_COUNT) {
    targetCells.add(Math.floor(random() * CANCELLATION_GRID_SIZE))
  }
  const grid: string[] = []
  for (let cellIndex = 0; cellIndex < CANCELLATION_GRID_SIZE; cellIndex += 1) {
    if (targetCells.has(cellIndex)) {
      grid.push(target)
      continue
    }
    grid.push(distractors[Math.floor(random() * distractors.length)])
  }
  return { scanIndex, target, grid, targetCells: [...targetCells].sort((a, b) => a - b) }
}
