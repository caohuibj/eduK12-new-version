import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { ArithverifyConfig } from '../schemas/arithverify.config'
import { ArithverifyTrial } from '../schemas/arithverify.trial'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const round = (value: number): number => Number(value.toFixed(4))

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const LOW_ACCURACY = 0.5
const MIN_VALID_CORRECT_RT = 2

/** Arithverify v1：等式真伪、正确性与 Product Index 均由服务端推导。 */
export const scoreArithverifyV1 = (input: {
  config: ArithverifyConfig
  trials: ScoringTrial<ArithverifyTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `arithverify v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `arithverify v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })

  const derivedTruth = (trial: ArithverifyTrial): boolean =>
    trial.leftOperand + trial.rightOperand === trial.displayedResult
  const isCorrect = (trial: ArithverifyTrial): boolean =>
    trial.response !== null && trial.response === derivedTruth(trial)

  const expectedTrue = Math.round(config.totalTrials * config.trueRatio)
  const trueTrials = sorted.filter((trial) => derivedTruth(trial.payload))
  if (trueTrials.length !== expectedTrue || sorted.length - trueTrials.length !== config.totalTrials - expectedTrue) {
    throw new CognitiveScoringInputError(
      `arithverify v1 expects ${expectedTrue} true and ${config.totalTrials - expectedTrue} false equations`
    )
  }

  const correctCount = sorted.filter((trial) => isCorrect(trial.payload)).length
  const accuracy = correctCount / sorted.length

  const validCorrectRts = sorted
    .filter((trial) => isCorrect(trial.payload) && trial.payload.rtMs !== null)
    .map((trial) => trial.payload.rtMs as number)
    .filter((rt) => rt >= config.validRtFloorMs)
  const medianRtMs = median(validCorrectRts)

  // 问题规模效应（Groen & Parkman 1972）：正确有效 RT 对两操作数之和的线性斜率。
  const sizePoints = sorted
    .filter((trial) => isCorrect(trial.payload) && trial.payload.rtMs !== null)
    .map((trial) => ({
      size: trial.payload.leftOperand + trial.payload.rightOperand,
      rt: trial.payload.rtMs as number,
    }))
    .filter((point) => point.rt >= config.validRtFloorMs)
  let problemSizeSlopeMs: number | null = null
  if (sizePoints.length >= 2 && new Set(sizePoints.map((point) => point.size)).size >= 2) {
    const meanSize = sizePoints.reduce((sum, point) => sum + point.size, 0) / sizePoints.length
    const meanRt = sizePoints.reduce((sum, point) => sum + point.rt, 0) / sizePoints.length
    const covariance = sizePoints.reduce((sum, point) => sum + (point.size - meanSize) * (point.rt - meanRt), 0)
    const variance = sizePoints.reduce((sum, point) => sum + (point.size - meanSize) ** 2, 0)
    problemSizeSlopeMs = variance === 0 ? null : round(covariance / variance)
  }

  const insufficientValidRt = validCorrectRts.length < MIN_VALID_CORRECT_RT
  const lowAccuracy = accuracy < LOW_ACCURACY

  return {
    score: Math.round(accuracy * 100),
    metrics: {
      accuracy,
      medianRtMs,
      problemSizeSlopeMs,
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
