import { SERIESCOMPLETE_BANK } from './bank-v1.1'

export interface SeriescompleteStimulus {
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
export const buildSeriescompleteItems = (seed: string, totalTrials: number): SeriescompleteStimulus[] => {
  if (!Number.isInteger(totalTrials) || totalTrials < 1 || totalTrials > 36) throw new RangeError('Expected 1..36 distinct formal items')
  const random = mulberry32(xmur3(`${seed}:seriescomplete:1.1.0`)())
  const pool = [...SERIESCOMPLETE_BANK]
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

export const SERIESCOMPLETE_PRACTICE_ITEM = {"id": "practice-seriescomplete-11", "stem": "10, 20, 30, ?（规则：每次加10）", "options": ["35", "40", "45", "50"], "answer": 1, "explanation": "每次加10，所以选40。"} as const
