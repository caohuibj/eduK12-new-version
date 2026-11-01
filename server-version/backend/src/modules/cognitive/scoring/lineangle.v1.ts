import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { LineangleConfig } from '../schemas/lineangle.config'
import { LineangleTrial } from '../schemas/lineangle.trial'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const LOW_ACCURACY = 0.5
const MIN_VALID_CORRECT_RT = 2

/** Lineangle v1：选项合法性与正确性由服务端推导。 */
export const scoreLineangleV1 = (input: {
  config: LineangleConfig
  trials: ScoringTrial<LineangleTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `lineangle v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    const { payload } = trial
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `lineangle v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
    if (payload.optionAngles.length !== config.optionCount) {
      throw new CognitiveScoringInputError(`lineangle v1 trial ${index} expects ${config.optionCount} options`)
    }
    if (new Set(payload.optionAngles).size !== payload.optionAngles.length) {
      throw new CognitiveScoringInputError(`lineangle v1 trial ${index} options must be distinct`)
    }
    if (payload.optionAngles.filter((angle) => angle === payload.targetAngle).length !== 1) {
      throw new CognitiveScoringInputError(`lineangle v1 trial ${index} target must appear exactly once among options`)
    }
    if (payload.responseAngle !== null && !payload.optionAngles.includes(payload.responseAngle)) {
      throw new CognitiveScoringInputError(`lineangle v1 trial ${index} response not among options`)
    }
  })

  const isCorrect = (trial: LineangleTrial): boolean => trial.responseAngle === trial.targetAngle
  const correctCount = sorted.filter((trial) => isCorrect(trial.payload)).length
  const accuracy = correctCount / sorted.length
  const validCorrectRts = sorted
    .filter((trial) => isCorrect(trial.payload) && trial.payload.rtMs !== null)
    .map((trial) => trial.payload.rtMs as number)
    .filter((rt) => rt >= config.validRtFloorMs)
  const medianRtMs = median(validCorrectRts)

  const insufficientValidRt = validCorrectRts.length < MIN_VALID_CORRECT_RT
  const lowAccuracy = accuracy < LOW_ACCURACY

  return {
    score: Math.round(accuracy * 100),
    metrics: {
      accuracy,
      medianRtMs,
      errorCount: sorted.length - correctCount - sorted.filter((trial) => trial.payload.responseAngle === null).length,
      timeoutCount: sorted.filter((trial) => trial.payload.responseAngle === null).length,
      validRtCount: validCorrectRts.length,
    },
    qualityFlags: {
      interpretable: !insufficientValidRt,
      insufficientValidRt,
      lowAccuracy,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
