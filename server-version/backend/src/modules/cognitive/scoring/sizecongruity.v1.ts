import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { SizecongruityConfig } from '../schemas/sizecongruity.config'
import { SizecongruityTrial } from '../schemas/sizecongruity.trial'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const LOW_ACCURACY = 0.5

/** Sizecongruity v1：数值较大侧、条件、正确性与 Product Index 均由服务端推导。 */
export const scoreSizecongruityV1 = (input: {
  config: SizecongruityConfig
  trials: ScoringTrial<SizecongruityTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `sizecongruity v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `sizecongruity v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })

  const largerSide = (trial: SizecongruityTrial): 'left' | 'right' =>
    trial.leftDigit > trial.rightDigit ? 'left' : 'right'
  const isCongruent = (trial: SizecongruityTrial): boolean =>
    (trial.leftFontScale === 'large') === (largerSide(trial) === 'left')
  const isCorrect = (trial: SizecongruityTrial): boolean =>
    trial.response !== null && trial.response === largerSide(trial)

  const congruent = sorted.filter((trial) => isCongruent(trial.payload))
  const incongruent = sorted.filter((trial) => !isCongruent(trial.payload))
  const expectedCongruent = Math.round(config.totalTrials * config.congruentRatio)
  if (congruent.length !== expectedCongruent || incongruent.length !== config.totalTrials - expectedCongruent) {
    throw new CognitiveScoringInputError(
      `sizecongruity v1 expects ${expectedCongruent} congruent and ${config.totalTrials - expectedCongruent} incongruent trials`
    )
  }

  const congruentCorrect = congruent.filter((trial) => isCorrect(trial.payload)).length
  const incongruentCorrect = incongruent.filter((trial) => isCorrect(trial.payload)).length
  const accuracy = (congruentCorrect + incongruentCorrect) / sorted.length
  const congruentAccuracy = congruentCorrect / congruent.length
  const incongruentAccuracy = incongruentCorrect / incongruent.length

  const validRts = (trials: ScoringTrial<SizecongruityTrial>[]): number[] =>
    trials
      .filter((trial) => isCorrect(trial.payload) && trial.payload.rtMs !== null)
      .map((trial) => trial.payload.rtMs as number)
      .filter((rt) => rt >= config.validRtFloorMs)
  const validCongruentRts = validRts(congruent)
  const validIncongruentRts = validRts(incongruent)
  const medianRtCongruent = median(validCongruentRts)
  const medianRtIncongruent = median(validIncongruentRts)
  const sizeCongruityEffectMs =
    medianRtCongruent === null || medianRtIncongruent === null
      ? null
      : medianRtIncongruent - medianRtCongruent

  const insufficientValidCongruentRt = validCongruentRts.length < 2
  const insufficientValidIncongruentRt = validIncongruentRts.length < 2
  const lowAccuracy = accuracy < LOW_ACCURACY

  return {
    score: Math.round(accuracy * 100),
    metrics: {
      accuracy,
      congruentAccuracy,
      incongruentAccuracy,
      medianRtCongruent,
      medianRtIncongruent,
      sizeCongruityEffectMs,
      timeoutCount: sorted.filter((trial) => trial.payload.response === null).length,
      validCongruentRtCount: validCongruentRts.length,
      validIncongruentRtCount: validIncongruentRts.length,
    },
    qualityFlags: {
      interpretable: !insufficientValidCongruentRt && !insufficientValidIncongruentRt,
      insufficientValidCongruentRt,
      insufficientValidIncongruentRt,
      lowAccuracy,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
