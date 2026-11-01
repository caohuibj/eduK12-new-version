import { PROOFREAD_BANK } from './bank'

export interface ProofreadStimulus {
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
export const buildProofreadItems = (seed: string, totalTrials: number): ProofreadStimulus[] => {
  if (!Number.isInteger(totalTrials) || totalTrials < 1 || totalTrials > PROOFREAD_BANK.length) throw new RangeError('proofread: formal trial count exceeds frozen bank capacity')
  const random = mulberry32(xmur3(`${seed}:proofread:1.1.0`)())
  const pool = [...PROOFREAD_BANK]
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

export const PROOFREAD_PRACTICE_ITEM = {
  "id": "pf-practice-1",
  "stem": "明天要远足，我先整里好书包，再检查水壶。",
  "options": [
    "远足",
    "书包",
    "检查",
    "整里"
  ],
  "answer": 3,
  "explanation": "“整里”应写为“整理”。其他三个选项在这句话中写法正确。"
}
