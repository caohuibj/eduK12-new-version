import { CognitiveScoreResult, ScoringTrial } from '../cognitive.types'
import { MemoryConfig } from '../schemas/memory.config'
import { MemoryTrial } from '../schemas/memory.trial'
import { scoreMemoryV1 } from './memory.v1'

const sequenceMatches = (left: number[], right: number[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const isPerseverativeResponse = (response: number[]): boolean =>
  response.length > 1 && response.every((digit) => digit === response[0])

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
  const invalidSequencePattern = sorted.some((trial) => isPerseverativeResponse(trial.payload.response))
  const interpretable = !insufficientCompletedLevels && !invalidSequencePattern

  return {
    ...base,
    metrics: {
      ...base.metrics,
      totalCorrectTrials,
    },
    qualityFlags: {
      ...base.qualityFlags,
      interpretable,
      insufficientCompletedLevels,
      invalidSequencePattern,
    },
  }
}
