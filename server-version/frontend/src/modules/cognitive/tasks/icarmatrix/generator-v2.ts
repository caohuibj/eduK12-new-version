/** Icarmatrix v2 shared generator (frontend mirror; identical logic to the
 * backend copy). 题库 JSON 由 PR2 管线双写至前后端；本模块只做确定性的
 * 选题与选项呈现排序，正确性推导函数与后端共享同一实现。
 * 自包含：不依赖 zod（前端无该依赖），题库结构由生成管线 QC 保证。
 */

import bankJson from './bank-matgen.json'

export const ICARMATRIX_V2_STIMULUS_SET_VERSION = 'matgen-bank-v1.0.0'
export const ICARMATRIX_V2_OPTION_COUNT = 6

export type MatrixBankItem = {
  itemId: string
  matrixType: '2x2' | '3x3'
  ruleTags: string[]
  cells: string[]
  responses: Array<{ name: string; svg: string }>
  correctResponseIndex: number
}

const bank = bankJson as { items: MatrixBankItem[] }
export const ICARMATRIX_V2_BANK: readonly MatrixBankItem[] = bank.items

const bankIndicesByType = (matrixType: '2x2' | '3x3'): number[] => {
  const indices: number[] = []
  bank.items.forEach((item, index) => {
    if (item.matrixType === matrixType) indices.push(index)
  })
  return indices
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

export const generateIcarmatrixV2Plan = (
  seed: string,
  totalTrials: number,
  matrixType: '2x2' | '3x3',
): number[] => {
  const pool = bankIndicesByType(matrixType)
  if (pool.length === 0) throw new Error(`empty icarmatrix v2 bank pool for ${matrixType}`)
  const random = mulberry32(xmur3(`${seed}:icarmatrix-v2:plan`)())
  const shuffled = [...pool]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]]
  }
  return Array.from({ length: totalTrials }, (_, index) => shuffled[index % shuffled.length])
}

export const icarmatrixV2OptionOrder = (
  seed: string,
  trialIndex: number,
  responseCount: number,
  optionCount = ICARMATRIX_V2_OPTION_COUNT,
): number[] => {
  const take = Math.min(optionCount, responseCount)
  const random = mulberry32(xmur3(`${seed}:icarmatrix-v2:order:${trialIndex}`)())
  const chosen = [0]
  const pool: number[] = []
  for (let index = 1; index < responseCount; index += 1) pool.push(index)
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[pool[index], pool[swap]] = [pool[swap], pool[index]]
  }
  while (chosen.length < take && pool.length > 0) chosen.push(pool.pop() as number)
  for (let index = chosen.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[chosen[index], chosen[swap]] = [chosen[swap], chosen[index]]
  }
  return chosen
}
