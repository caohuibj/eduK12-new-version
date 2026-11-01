import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { TimecopyConfig } from '../schemas/timecopy.config'
import { TimecopyTrial } from '../schemas/timecopy.trial'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const round = (value: number): number => Number(value.toFixed(4))

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const WITHIN_TWENTY = 0.2
const EXCESSIVE_DEVIATION = 1

/** Timecopy v1：复制误差、方向偏差与 Product Index 均由服务端推导。 */
export const scoreTimecopyV1 = (input: {
  config: TimecopyConfig
  trials: ScoringTrial<TimecopyTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `timecopy v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `timecopy v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
    if (trial.payload.targetMs < config.targetMinMs || trial.payload.targetMs > config.targetMaxMs) {
      throw new CognitiveScoringInputError(`timecopy v1 trial ${index} target outside the frozen range`)
    }
  })

  const absErrors: number[] = []
  const signedErrors: number[] = []
  const withinTwenty: number[] = []
  const reproductions: number[] = []

  for (const trial of sorted) {
    if (trial.payload.interrupted) continue
    const ratio = (trial.payload.responseMs - trial.payload.targetMs) / trial.payload.targetMs
    signedErrors.push(ratio)
    absErrors.push(Math.abs(ratio))
    withinTwenty.push(Math.abs(ratio) <= WITHIN_TWENTY ? 1 : 0)
    reproductions.push(trial.payload.responseMs)
  }

  const validCount = absErrors.length
  const meanAbsErrorRatio = validCount === 0 ? null : round(absErrors.reduce((sum, value) => sum + value, 0) / validCount)
  const biasRatio = validCount === 0 ? null : round(signedErrors.reduce((sum, value) => sum + value, 0) / validCount)
  const withinTwentyRate = validCount === 0 ? null : round(withinTwenty.reduce((sum, value) => sum + value, 0) / validCount)
  const medianReproductionMs = median(reproductions)

  return {
    score: meanAbsErrorRatio === null ? 0 : Math.max(0, Math.round((1 - meanAbsErrorRatio) * 100)),
    metrics: {
      meanAbsErrorRatio,
      biasRatio,
      withinTwentyRate,
      medianReproductionMs,
    },
    qualityFlags: {
      interpretable: validCount > 0 && (meanAbsErrorRatio ?? 0) < EXCESSIVE_DEVIATION,
      emptyResponses: validCount === 0,
      excessiveDeviation: (meanAbsErrorRatio ?? 0) >= EXCESSIVE_DEVIATION,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
