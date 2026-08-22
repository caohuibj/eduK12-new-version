import {
  CognitiveScoreResult,
  CognitiveScoringInputError,
  ScoringTrial,
} from '../cognitive.types'
import { ReactionConfig } from '../schemas/reaction.config'
import { ReactionTrial } from '../schemas/reaction.trial'

/**
 * Reaction Test v1 Scorer（Milestone E Session 2 / §33–§35）。
 *
 * 纯函数式领域逻辑：不访问 Express / JWT / Prisma / Redis。
 *
 * 校验顺序：
 *   1. 按 trialIndex 排序
 *   2. trial 数量严格等于 config.totalTrials
 *   3. trialIndex 为 0 .. totalTrials-1，无缺口、无重复
 *   4. foreperiodMs 在 [foreperiodMinMs, foreperiodMaxMs] 范围内（§20 range invariant）
 *   5. 推导 valid hit / miss，计算科学指标 + Product Index + qualityFlags
 *
 * valid hit  = rtMs != null && rtMs >= VALID_RT_FLOOR_MS && rtMs <= timeoutMs
 * miss       = rtMs == null || rtMs < VALID_RT_FLOOR_MS || rtMs > timeoutMs
 */

// F4：quality 阈值放 scoring v1 常量（由 scoringVersion 钉死，不进 config schema，避免 schema 膨胀）
const MIN_VALID_RATIO = 0.6
const HIGH_MISS_RATE = 0.3
const VALID_RT_FLOOR_MS = 100

// Reaction Performance Index v1 candidate（§35，product-defined，非 percentile / 常模 / device norm）
// 分段线性映射（rt 越大 index 越低），round + clamp 到 [30, 100]。
// 以中位反应时 medianRtMs 为输入（§97 示例）。Pilot 后若分布不合理再走 scoringVersion review。
const INDEX_BREAKPOINTS: ReadonlyArray<{ r: number; v: number }> = [
  { r: 0, v: 100 },
  { r: 250, v: 90 },
  { r: 350, v: 70 },
  { r: 500, v: 50 },
  { r: 2000, v: 30 },
]

function reactionPerformanceIndex(medianRtMs: number | null): number {
  if (medianRtMs == null) return 30
  if (medianRtMs <= 0) return 100
  const r = medianRtMs
  const last = INDEX_BREAKPOINTS[INDEX_BREAKPOINTS.length - 1]
  if (r >= last.r) return last.v
  for (let i = 0; i < INDEX_BREAKPOINTS.length - 1; i++) {
    const a = INDEX_BREAKPOINTS[i]
    const b = INDEX_BREAKPOINTS[i + 1]
    if (r >= a.r && r <= b.r) {
      const t = (r - a.r) / (b.r - a.r)
      const v = a.v + t * (b.v - a.v)
      return Math.max(30, Math.min(100, Math.round(v)))
    }
  }
  return 30
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function sd(values: number[]): number {
  if (values.length === 0) return 0
  const m = mean(values)
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export const scoreReactionV1 = (input: {
  config: ReactionConfig
  trials: ScoringTrial<ReactionTrial>[]
}): CognitiveScoreResult => {
  const { config, trials } = input

  const sorted = [...trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)

  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `reaction v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }

  // 排序后要求 sorted[i].trialIndex === i，覆盖缺口与重复（重复 index 排序后同样会触发缺口）。
  sorted.forEach((t, i) => {
    if (t.trialIndex !== i) {
      throw new CognitiveScoringInputError(
        `reaction v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${t.trialIndex} at position ${i}`
      )
    }
  })

  // range invariants（§20）：foreperiodMs 必须在配置区间内
  sorted.forEach((t) => {
    if (t.payload.foreperiodMs < config.foreperiodMinMs || t.payload.foreperiodMs > config.foreperiodMaxMs) {
      throw new CognitiveScoringInputError(
        `reaction v1 trial ${t.trialIndex} foreperiodMs ${t.payload.foreperiodMs} out of [${config.foreperiodMinMs}, ${config.foreperiodMaxMs}]`
      )
    }
  })

  const isValid = (rt: number | null): rt is number =>
    rt != null && rt >= VALID_RT_FLOOR_MS && rt <= config.timeoutMs

  const validRts = sorted.map((t) => t.payload.rtMs).filter(isValid)

  const validTrialCount = validRts.length
  const missCount = sorted.length - validTrialCount
  const missRate = missCount / sorted.length
  const prematureCount = sorted.reduce((sum, t) => sum + t.payload.prematureCount, 0)
  const interruptedCount = sorted.filter((t) => t.payload.interrupted).length

  const medianRtMs = median(validRts)
  const meanRtMs = medianRtMs == null ? null : mean(validRts)
  const sdRtMs = medianRtMs == null ? null : sd(validRts)
  const rtICV = medianRtMs == null || (meanRtMs ?? 0) <= 0 ? null : (sdRtMs as number) / (meanRtMs as number)
  const fastestRtMs = medianRtMs == null ? null : Math.min(...validRts)

  const insufficientValidTrials = validTrialCount < Math.ceil(MIN_VALID_RATIO * config.totalTrials)
  const highMissRate = missRate >= HIGH_MISS_RATE
  const interpretable = !insufficientValidTrials
  const interrupted = interruptedCount > 0

  const score = reactionPerformanceIndex(medianRtMs)

  return {
    score,
    metrics: {
      totalTrials: config.totalTrials,
      medianRtMs,
      meanRtMs,
      sdRtMs,
      rtICV,
      fastestRtMs,
      missCount,
      missRate,
      prematureCount,
      validTrialCount,
    },
    qualityFlags: {
      interpretable,
      insufficientValidTrials,
      highMissRate,
      interrupted,
    },
  }
}
