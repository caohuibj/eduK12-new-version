import { CognitiveScoreResult, ScoringTrial } from '../cognitive.types'
import { ReactionConfig } from '../schemas/reaction.config'
import { ReactionTrial } from '../schemas/reaction.trial'
import { scoreReactionV1 } from './reaction.v1'

/** 提前反应试次占比达到该阈值则标记 excessivePremature（由 scoringVersion 1.1.0 钉死）。 */
const EXCESSIVE_PREMATURE_RATIO = 0.2
/** 有效 RT 的 ICV 超过该阈值则标记 extremeRtPattern。 */
const EXTREME_RT_ICV = 0.8

/**
 * Reaction scoring 1.1.0：复用 v1.0.0 指标，补质量旗标。
 * 不改变 median/mean/sd/ICV/Product Index 公式。
 */
export const scoreReactionV1_1 = (input: {
  config: ReactionConfig
  trials: ScoringTrial<ReactionTrial>[]
}): CognitiveScoreResult => {
  const base = scoreReactionV1(input)
  const prematureTrialCount = input.trials.filter(
    (trial) => trial.trialIndex >= 0 && trial.trialIndex < input.config.totalTrials && trial.payload.prematureCount > 0
  ).length
  const excessivePremature = prematureTrialCount / input.config.totalTrials >= EXCESSIVE_PREMATURE_RATIO
  const rtICV = typeof base.metrics.rtICV === 'number' ? base.metrics.rtICV : null
  const extremeRtPattern = rtICV != null && rtICV > EXTREME_RT_ICV

  return {
    ...base,
    qualityFlags: {
      ...base.qualityFlags,
      excessivePremature,
      extremeRtPattern,
    },
  }
}
