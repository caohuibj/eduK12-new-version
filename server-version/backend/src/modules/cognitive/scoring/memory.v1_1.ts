import { CognitiveScoreResult, ScoringTrial } from '../cognitive.types'
import { MemoryConfig } from '../schemas/memory.config'
import { MemoryTrial } from '../schemas/memory.trial'
import { scoreMemoryV1 } from './memory.v1'

const sequenceMatches = (left: number[], right: number[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const isPerseverativeResponse = (response: number[]): boolean =>
  response.length > 1 && response.every((digit) => digit === response[0])

/** scoringVersion 1.1.0 钉死：错误试次中持续全同数字作答才算异常，正确重复序列不算。 */
const MIN_PERSEVERATIVE_TRIALS = 3
const MIN_PERSEVERATIVE_RATIO = 0.5

/**
 * Memory scoring 1.1.0：复用 v1.0.0 的 maxSpan / 升级路径，补 totalCorrectTrials 与质量旗标。
 * 不改变 Product Index（maxSpan / maxLength * 100）。
 */
export const scoreMemoryV1_1 = (input: {
  config: MemoryConfig
  trials: ScoringTrial<MemoryTrial>[]
}): CognitiveScoreResult => {
  const base = scoreMemoryV1(input)
  const sorted = [...input.trials].sort((a, b) => a.trialIndex - b.trialIndex)
  const totalCorrectTrials = sorted.filter((trial) =>
    sequenceMatches(trial.payload.sequence, trial.payload.response)
  ).length
  const trialCount = typeof base.metrics.trialCount === 'number' ? base.metrics.trialCount : sorted.length
  const insufficientCompletedLevels = trialCount < input.config.trialsPerLevel * 2
  const perseverativeTrialCount = sorted.filter((trial) =>
    !sequenceMatches(trial.payload.sequence, trial.payload.response)
    && isPerseverativeResponse(trial.payload.response)
  ).length
  const invalidSequencePattern =
    perseverativeTrialCount >= MIN_PERSEVERATIVE_TRIALS
    && perseverativeTrialCount / Math.max(trialCount, 1) >= MIN_PERSEVERATIVE_RATIO
  const interpretable = !insufficientCompletedLevels && !invalidSequencePattern

  return {
    ...base,
    metrics: {
      ...base.metrics,
      totalCorrectTrials,
      perseverativeTrialCount,
    },
    qualityFlags: {
      ...base.qualityFlags,
      interpretable,
      insufficientCompletedLevels,
      invalidSequencePattern,
    },
  }
}
