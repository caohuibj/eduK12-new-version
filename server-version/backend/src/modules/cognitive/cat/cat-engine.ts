/**
 * COG-Intelligence Roadmap v2.0 PR7 — 轻量 CAT 适配器（服务端选题）。
 *
 * 规则（roadmap §五 PR7 / §2.3）：
 *  - 在线只做轻量计算：EAP 能力估计（固定节点数值积分）+ Fisher 信息选题
 *    + randomesque 曝光控制（前 K 随机）+ 内容平衡（规则族配额）。
 *    不逐题拟合 IRT 模型；参数来自冻结的 calibrationVersion 快照。
 *  - 断线恢复可复现：选题是 (历史作答, seed) 的纯函数，无隐藏状态。
 *  - 证据纪律：SIMULATION_ONLY 快照只允许进入仿真 harness
 *    （allowSimulationPool=true，仅测试/管线验证使用）；产品施测要求
 *    status >= PILOT_CALIBRATED。
 *  - 停止规则：min/max 题量 + SE 阈值；题库不足时由调用方退回固定版本
 *    （fixedCountFinalSubmission 通路）。
 */

import { calibrationSnapshotSchema, type CalibrationSnapshot } from '../banks/calibration-snapshot-schema'

export interface CatItem {
  itemId: string
  a: number
  b: number
  ruleTag: string
}

export interface CatSelectionConfig {
  minItems: number
  maxItems: number
  /** theta 估计标准误达到该值即停（达到 minItems 之后）。 */
  seStopThreshold: number
  /** randomesque 曝光控制：信息量前 K 名中随机选一。 */
  randomesqueK: number
  /** 断线恢复与 randomesque 的确定性来源（session randomSeed）。 */
  seed: string
}

export interface CatHistoryEntry {
  itemId: string
  correct: boolean
}

export type CatOperationalMode = 'simulation-only' | 'operational'

export const catOperationalMode = (snapshot: CalibrationSnapshot): CatOperationalMode =>
  snapshot.status === 'SIMULATION_ONLY' ? 'simulation-only' : 'operational'

const sqrt2pi = Math.sqrt(2 * Math.PI)
const normalPdf = (x: number): number => Math.exp(-0.5 * x * x) / sqrt2pi
const icc = (item: CatItem, theta: number): number => 1 / (1 + Math.exp(-item.a * (theta - item.b)))

const QUADRATURE_POINTS = 81
const QUADRATURE = (() => {
  const points: number[] = []
  for (let index = 0; index < QUADRATURE_POINTS; index += 1) {
    points.push(-4 + (8 * index) / (QUADRATURE_POINTS - 1))
  }
  return points
})()

/** EAP 能力估计（N(0,1) 先验，固定节点数值积分）。history 为空时返回 null。 */
export const estimateCatTheta = (
  itemsById: Map<string, CatItem>,
  history: CatHistoryEntry[],
): { theta: number; se: number } | null => {
  if (history.length === 0) return null
  const seen = new Set<string>()
  for (const response of history) {
    if (!itemsById.has(response.itemId) || seen.has(response.itemId)) {
      throw new Error('CAT history contains unknown or duplicate item IDs')
    }
    seen.add(response.itemId)
  }
  let posteriorSum = 0
  let posteriorThetaSum = 0
  let posteriorTheta2Sum = 0
  for (const node of QUADRATURE) {
    let logLikelihood = 0
    for (const entry of history) {
      const item = itemsById.get(entry.itemId)
      if (!item) continue
      const p = icc(item, node)
      logLikelihood += Math.log(entry.correct ? Math.max(p, 1e-12) : Math.max(1 - p, 1e-12))
    }
    const posterior = Math.exp(logLikelihood) * normalPdf(node)
    posteriorSum += posterior
    posteriorThetaSum += posterior * node
    posteriorTheta2Sum += posterior * node * node
  }
  const theta = posteriorThetaSum / posteriorSum
  const variance = posteriorTheta2Sum / posteriorSum - theta * theta
  return { theta, se: Math.sqrt(Math.max(variance, 0)) }
}

const fisherInformation = (item: CatItem, theta: number): number => {
  const p = icc(item, theta)
  return item.a * item.a * p * (1 - p)
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

/** 停止规则：达到 minItems 且（SE 达标或题库耗尽），或达到 maxItems。 */
export const shouldStopCatSession = (
  history: CatHistoryEntry[],
  poolSize: number,
  se: number | null,
  config: CatSelectionConfig,
): boolean => {
  if (history.length >= config.maxItems) return true
  if (history.length < config.minItems) return false
  if (history.length >= poolSize) return true
  return se !== null && se <= config.seStopThreshold
}

/** 选题：内容平衡配额内的未施测题中，按 Fisher 信息取前 randomesqueK 名随机选一。
 * 纯函数：(history, seed) 完全决定结果，断线恢复后重放一致。 */
export const selectNextCatItem = (
  pool: CatItem[],
  history: CatHistoryEntry[],
  config: CatSelectionConfig,
): { itemId: string } | null => {
  if (!Number.isInteger(config.minItems) || !Number.isInteger(config.maxItems) ||
      config.minItems < 1 || config.maxItems < config.minItems ||
      !Number.isInteger(config.randomesqueK) || config.randomesqueK < 1 ||
      !Number.isFinite(config.seStopThreshold) || config.seStopThreshold <= 0 ||
      !config.seed || pool.length < config.minItems ||
      new Set(pool.map((item) => item.itemId)).size !== pool.length) {
    throw new Error('Invalid CAT pool or selection configuration')
  }
  if (pool.some((item) => !Number.isFinite(item.a) || item.a <= 0 || !Number.isFinite(item.b))) {
    throw new Error('Invalid IRT item parameters')
  }
  // Validate the complete history before considering exhaustion or the stop rule:
  // an unknown/repeated trial must never be mistaken for a successfully finished CAT.
  const estimate = estimateCatTheta(new Map(pool.map((item) => [item.itemId, item])), history)
  const administeredIds = new Set(history.map((entry) => entry.itemId))
  const remaining = pool.filter((item) => !administeredIds.has(item.itemId))
  if (shouldStopCatSession(history, pool.length, estimate?.se ?? null, config) || remaining.length === 0) return null
  const theta = estimate?.theta ?? 0

  // 内容平衡：规则族配额 = ceil(已施测+1 / 规则族数)，超额族先排除；若全部超额则放松。
  const ruleFamilies = [...new Set(pool.map((item) => item.ruleTag))].sort()
  const familyCount = new Map<string, number>()
  for (const entry of history) {
    const item = pool.find((candidate) => candidate.itemId === entry.itemId)
    if (item) familyCount.set(item.ruleTag, (familyCount.get(item.ruleTag) ?? 0) + 1)
  }
  const quota = Math.ceil((history.length + 1) / ruleFamilies.length)
  let candidates = remaining.filter((item) => (familyCount.get(item.ruleTag) ?? 0) < quota)
  if (candidates.length === 0) candidates = remaining

  const ranked = [...candidates].sort((a, b) => fisherInformation(b, theta) - fisherInformation(a, theta))
  const topK = ranked.slice(0, Math.min(config.randomesqueK, ranked.length))
  const random = mulberry32(xmur3(`${config.seed}:cat:${history.length}:${history.map((entry) => (entry.correct ? '1' : '0')).join('')}`)())
  return { itemId: topK[Math.floor(random() * topK.length)].itemId }
}

/** 从标定快照构建题目池（调用方提供 ruleTag 映射；仿真快照仅供 harness）。 */
export const buildCatPool = (
  snapshot: CalibrationSnapshot,
  ruleTagByItemId: Map<string, string>,
  options: { allowSimulationPool?: boolean } = {},
): CatItem[] => {
  calibrationSnapshotSchema.parse(snapshot)
  if (snapshot.status === 'SIMULATION_ONLY' &&
      (!options.allowSimulationPool || process.env.NODE_ENV === 'production')) {
    throw new Error('CAT pool from a SIMULATION_ONLY calibration snapshot may only be used by the simulation harness')
  }
  return snapshot.items
    .filter((item) => ruleTagByItemId.has(item.itemId))
    .map((item) => ({ itemId: item.itemId, a: item.a, b: item.b, ruleTag: ruleTagByItemId.get(item.itemId)! }))
}
