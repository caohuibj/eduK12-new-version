/** Icarmatrix v2 shared generator (backend copy; identical mirror on the frontend).
 * 规则题库轨（Roadmap v2.0 PR3）：题目取自提交入库的 matRiks 生成题库
 * （banks/bank-matgen.json），按 seed 确定性选题与选项呈现排序；
 * 正确项由服务端按题库推导（correctResponseIndex=0）。
 * 后端与前端共享同一份 JSON；本模块只做确定性的选题与排序。
 */

import bankJson from '../../banks/bank-matgen.json'
import { matrixBankFileSchema, type MatrixBankItem } from '../../banks/matrix-bank-schema'

export const ICARMATRIX_V2_STIMULUS_SET_VERSION = 'matgen-bank-v1.0.0'
export const ICARMATRIX_V2_OPTION_COUNT = 6

const bank = matrixBankFileSchema.parse(bankJson)
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

/** 选题计划：按 seed 洗牌后循环取用，保证 totalTrials 超出题库时仍确定可复现。 */
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

/** 选项呈现顺序：从题库响应中确定性抽取 optionCount 个（必含正确项）并洗牌。
 * payload.responseIndex 是呈现序；服务端用同一函数还原 bank 序并判分。 */
export const icarmatrixV2OptionOrder = (
  seed: string,
  trialIndex: number,
  responseCount: number,
  optionCount = ICARMATRIX_V2_OPTION_COUNT,
): number[] => {
  const take = Math.min(optionCount, responseCount)
  const random = mulberry32(xmur3(`${seed}:icarmatrix-v2:order:${trialIndex}`)())
  // 正确项（bank 序 0）必选；其余从 1..n-1 抽取。
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

/** 呈现序 → bank 响应序的正确性判定。 */
export const icarmatrixV2IsCorrect = (
  seed: string,
  trialIndex: number,
  responseCount: number,
  responseIndex: number | null,
): boolean => {
  if (responseIndex === null) return false
  const order = icarmatrixV2OptionOrder(seed, trialIndex, responseCount)
  return order[responseIndex] === 0
}

import { cognitiveBankMetaSchema, type CognitiveBankMeta } from '../../banks/bank-meta'

/** PR1 题库元数据：matRiks 生成题库（PR2 管线产物，前后端双写）。 */
export const bankMeta: CognitiveBankMeta = cognitiveBankMetaSchema.parse({
  stimulusSetVersion: 'matgen-bank-v1.0.0',
  source: 'generated offline with matRiks (MIT) rule system; items are internal-authored derivatives',
  license: 'internal-generated',
  itemSetRole: 'form',
  ruleTags: ['shape', 'rotate', 'shade', 'size', 'identity'],
})
