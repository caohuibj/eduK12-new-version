import { READINGCOMP_BANK } from './bank'

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
  if (!Number.isInteger(totalTrials) || totalTrials < 1 || totalTrials > READINGCOMP_BANK.length) throw new RangeError('readingcomp: formal trial count exceeds frozen bank capacity')
  const random = mulberry32(xmur3(`${seed}:readingcomp:1.1.0`)())
  const pool = [...READINGCOMP_BANK]
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[pool[index], pool[swap]] = [pool[swap], pool[index]]
  }
  return pool.slice(0, totalTrials).map((item) => ({
    itemId: item.id,
    passage: item.passage,
    question: item.question,
    options: item.options,
  }))
}

export const READINGCOMP_PRACTICE_ITEM = {
  "id": "rc-practice-1",
  "passage": "小禾把雨伞放在门边的篮子里，把帽子放在书桌上。出门时她先到篮子里拿雨伞。",
  "question": "小禾的雨伞放在哪里？",
  "options": [
    "书桌上",
    "门边的篮子里",
    "窗台上",
    "椅子下面"
  ],
  "answer": 1,
  "explanation": "短文明说“雨伞放在门边的篮子里”。先看问题，再回原文找对应信息。"
}
