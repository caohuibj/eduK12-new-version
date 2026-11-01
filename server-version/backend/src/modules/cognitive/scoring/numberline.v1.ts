import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { NumberlineConfig } from '../schemas/numberline.config'
import { NumberlineTrial } from '../schemas/numberline.trial'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const round = (value: number): number => Number(value.toFixed(4))

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const WITHIN_TEN_FRACTION = 0.1
const MIN_VALID_TRIAL_FRACTION = 0.5
const MAX_TIMEOUT_FRACTION = 0.5

/** Numberline v1：估计误差、方向偏差与 Product Index 均由服务端推导。 */
export const scoreNumberlineV1 = (input: {
  config: NumberlineConfig
  trials: ScoringTrial<NumberlineTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `numberline v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `numberline v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
    if (trial.payload.targetNumber > config.lineMax) {
      throw new CognitiveScoringInputError(
        `numberline v1 target ${trial.payload.targetNumber} exceeds lineMax ${config.lineMax}`
      )
    }
  })

  const withinTenThreshold = config.lineMax * WITHIN_TEN_FRACTION
  const absErrors: number[] = []
  const signedErrors: number[] = []
  const withinTen: number[] = []
  const validRts: number[] = []

  for (const trial of sorted) {
    const payload = trial.payload
    if (payload.responsePosition === null) continue
    const estimate = payload.responsePosition * config.lineMax
    const signedError = estimate - payload.targetNumber
    signedErrors.push(signedError)
    absErrors.push(Math.abs(signedError))
    withinTen.push(Math.abs(signedError) <= withinTenThreshold ? 1 : 0)
    if (payload.rtMs !== null && payload.rtMs >= config.validRtFloorMs) validRts.push(payload.rtMs)
  }

  const validTrialCount = absErrors.length
  const timeoutCount = sorted.length - validTrialCount
  const paePercent = validTrialCount === 0 ? null : round((absErrors.reduce((sum, value) => sum + value, 0) / validTrialCount) / config.lineMax)
  const biasPercent = validTrialCount === 0 ? null : round((signedErrors.reduce((sum, value) => sum + value, 0) / validTrialCount) / config.lineMax)
  const withinTenRate = validTrialCount === 0 ? null : round(withinTen.reduce((sum, value) => sum + value, 0) / validTrialCount)
  const medianRtMs = median(validRts)

  const insufficientValidTrials = validTrialCount < Math.ceil(config.totalTrials * MIN_VALID_TRIAL_FRACTION)
  const excessiveTimeouts = timeoutCount > config.totalTrials * MAX_TIMEOUT_FRACTION

  return {
    score: paePercent === null ? 0 : Math.max(0, Math.round((1 - paePercent) * 100)),
    metrics: {
      paePercent,
      biasPercent,
      withinTenRate,
      medianRtMs,
      validTrialCount,
      timeoutCount,
    },
    qualityFlags: {
      interpretable: !insufficientValidTrials && !excessiveTimeouts,
      insufficientValidTrials,
      excessiveTimeouts,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
