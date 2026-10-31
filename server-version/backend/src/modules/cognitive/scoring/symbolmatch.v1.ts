import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { SymbolmatchConfig } from '../schemas/symbolmatch.config'
import { SymbolmatchTrial } from '../schemas/symbolmatch.trial'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const LOW_ACCURACY = 0.5
const MIN_VALID_CORRECT_RT = 2

/** Symbolmatch v1：正确性、用时统计与 Product Index 均由服务端推导。 */
export const scoreSymbolmatchV1 = (input: {
  config: SymbolmatchConfig
  trials: ScoringTrial<SymbolmatchTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `symbolmatch v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  const expectedDigit = new Map(config.symbolDigitMap)
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `symbolmatch v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
    if (!expectedDigit.has(trial.payload.symbol)) {
      throw new CognitiveScoringInputError(`symbolmatch v1 symbol ${trial.payload.symbol} is not in the frozen map`)
    }
  })

  const isCorrect = (trial: SymbolmatchTrial): boolean =>
    trial.response !== null && trial.response === expectedDigit.get(trial.symbol)

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
      errorCount: sorted.length - correctCount - sorted.filter((trial) => trial.payload.response === null).length,
      timeoutCount: sorted.filter((trial) => trial.payload.response === null).length,
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
