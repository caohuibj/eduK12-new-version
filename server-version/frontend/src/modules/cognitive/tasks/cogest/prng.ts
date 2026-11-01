import { COGEST_BANK } from './bank'

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
  const random = mulberry32(xmur3(`${seed}:cogest`)())
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

export const COGEST_PRACTICE_ITEM = {
  id: 'ce-01',
  stem: '一头成年大象大约有多重？',
  options: ['约 500 千克', '约 3 吨', '约 10 吨', '约 100 千克'] as [string, string, string, string],
}
