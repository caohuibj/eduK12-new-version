import { WORDANALOGY_BANK_V11 } from './bank-v1.1'

export interface WordanalogyStimulus {
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
export const buildWordanalogyItemsV11 = (seed: string, totalTrials: number): WordanalogyStimulus[] => {
  if (!Number.isInteger(totalTrials) || totalTrials < 1 || totalTrials > WORDANALOGY_BANK_V11.length) throw new RangeError('Requested trial count exceeds the reviewed bank')
  const random = mulberry32(xmur3(`${seed}:wordanalogy:v1.1.0`)())
  const pool = [...WORDANALOGY_BANK_V11]
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[pool[index], pool[swap]] = [pool[swap], pool[index]]
  }
  return pool.slice(0, totalTrials).map((item) => ({
    itemId: item.id,
    stem: item.stem,
    options: item.options,
  }))
}

export const WORDANALOGY_PRACTICE_ITEM_V11 = {
  "id": "wa-practice-01",
  "stem": "雨伞 对于 挡雨 相当于 手套 对于 ____",
  "options": [
    "保暖",
    "测量",
    "写字",
    "打扫"
  ],
  "answer": 0,
  "explanation": "雨伞用来挡雨，手套可以保暖；这是工具与用途的关系。"
} as const
