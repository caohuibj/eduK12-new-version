import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { FakeConfig } from '../schemas/fake.config'
import { FakeTrial } from '../schemas/fake.trial'

/**
 * Fake Test v1 Scorer（D2 Step 4）。
 *
 * 纯函数式领域逻辑：不访问 Express / JWT / Prisma / Redis。
 * 只用于验证框架，不扩展成真实认知任务。
 *
 * 校验顺序（D2 §8）：
 *   1. 按 trialIndex 排序
 *   2. trial 数量严格等于 config.trialCount
 *   3. trialIndex 为 0 .. trialCount-1，无缺口、无重复
 *   4. 每个 rtMs <= config.maxRtMs
 *   5. 计算 correctCount / accuracy / meanRtMs / score = accuracy * 100
 *
 * 不需要人为引入 percentile、norm、等级解释。
 */
export const scoreFakeV1 = (input: {
  config: FakeConfig
  trials: ScoringTrial<FakeTrial>[]
}): CognitiveScoreResult => {
  const { config, trials } = input

  const sorted = [...trials].sort((a, b) => a.trialIndex - b.trialIndex)

  if (sorted.length !== config.trialCount) {
    throw new CognitiveScoringInputError(
      `fake v1 expects exactly ${config.trialCount} trials, got ${sorted.length}`
    )
  }

  // 排序后要求 sorted[i].trialIndex === i，覆盖缺口与重复（重复 index 排序后同样会触发缺口）。
  sorted.forEach((t, i) => {
    if (t.trialIndex !== i) {
      throw new CognitiveScoringInputError(
        `fake v1 requires contiguous trialIndex 0..${config.trialCount - 1}; got ${t.trialIndex} at position ${i}`
      )
    }
  })

  sorted.forEach((t) => {
    if (t.payload.rtMs > config.maxRtMs) {
      throw new CognitiveScoringInputError(
        `fake v1 trial ${t.trialIndex} rtMs ${t.payload.rtMs} exceeds maxRtMs ${config.maxRtMs}`
      )
    }
  })

  const correctCount = sorted.filter((t) => t.payload.correct).length
  const accuracy = correctCount / config.trialCount
  const meanRtMs =
    sorted.reduce((sum, t) => sum + t.payload.rtMs, 0) / sorted.length

  return {
    score: accuracy * 100,
    metrics: {
      trialCount: config.trialCount,
      correctCount,
      accuracy,
      meanRtMs,
    },
    qualityFlags: {},
  }
}
