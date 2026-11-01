import { WORDMEANING_BANK_V11 } from './bank-v1.1'

export interface WordmeaningStimulus {
  itemId: string
  word: string
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
export const buildWordmeaningItemsV11 = (seed: string, totalTrials: number): WordmeaningStimulus[] => {
  if (!Number.isInteger(totalTrials) || totalTrials < 1 || totalTrials > WORDMEANING_BANK_V11.length) throw new RangeError('Requested trial count exceeds the reviewed bank')
  const random = mulberry32(xmur3(`${seed}:wordmeaning:v1.1.0`)())
  const pool = [...WORDMEANING_BANK_V11]
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[pool[index], pool[swap]] = [pool[swap], pool[index]]
  }
  return pool.slice(0, totalTrials).map((item) => ({
    itemId: item.id,
    word: item.word,
    options: item.options,
  }))
}

export const WORDMEANING_PRACTICE_ITEM_V11 = {
  "id": "wm-practice-01",
  "word": "宁静",
  "options": [
    "嘈杂热闹",
    "安静平和",
    "迅速移动",
    "颜色鲜艳"
  ],
  "answer": 1,
  "explanation": "宁静指安静、平和；这里不是热闹、运动或颜色。"
} as const
