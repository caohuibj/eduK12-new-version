import { READINGCOMP_BANK } from './bank.v1'

export interface ReadingcompStimulus {
  itemId: string
  passage: string
  question: string
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
export const buildReadingcompItems = (seed: string, totalTrials: number): ReadingcompStimulus[] => {
  const random = mulberry32(xmur3(`${seed}:readingcomp`)())
  const pool = [...READINGCOMP_BANK]
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[pool[index], pool[swap]] = [pool[swap], pool[index]]
  }
  return pool.slice(0, Math.min(totalTrials, pool.length)).map((item) => ({
    itemId: item.id,
    passage: item.passage,
    question: item.question,
    options: item.options,
  }))
}

export const READINGCOMP_PRACTICE_ITEM = {
  id: 'rc-01',
  passage: '小明每天早上六点半起床，先跑步二十分钟，然后吃早餐。他发现坚持晨跑后，上课时精神好了很多，也不容易犯困了。',
  question: '小明跑步后最大的变化是什么？',
  options: ['体重减轻了', '上课更有精神', '跑步速度变快', '认识了很多朋友'] as [string, string, string, string],
}
