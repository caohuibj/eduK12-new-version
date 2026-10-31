import { COGEST_BANK } from './bank-v1.1'

export interface CogestStimulus {
  itemId: string
  stem: string
  options: [string, string, string, string]
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

/** 按 seed 从冻结题库中抽取 N 个不重复题目，保持题库内选项顺序（正确项位置由题库冻结）。 */
export const buildCogestItems = (seed: string, totalTrials: number): CogestStimulus[] => {
  if (!Number.isInteger(totalTrials) || totalTrials < 1 || totalTrials > 36) throw new RangeError('Expected 1..36 distinct formal items')
  const random = mulberry32(xmur3(`${seed}:cogest:1.1.0`)())
  const pool = [...COGEST_BANK]
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[pool[index], pool[swap]] = [pool[swap], pool[index]]
  }
  return pool.slice(0, Math.min(totalTrials, pool.length)).map((item) => ({
    itemId: item.id,
    stem: item.stem,
    options: item.options,
  }))
}

export const COGEST_PRACTICE_ITEM = {"id": "practice-cogest-11", "stem": "例子：一条短路约100米，以每秒约1米走完，时间最接近？", "options": ["10秒", "2分钟", "20分钟", "2小时"], "answer": 1, "explanation": "100÷1≈100秒，最接近2分钟；这里只练习数量级估计。"} as const
