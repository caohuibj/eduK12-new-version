import {
  CognitiveScoreResult,
  CognitiveScoringInputError,
  ScoringTrial,
} from '../cognitive.types'
import { StroopConfig } from '../schemas/stroop.config'
import { StroopTrial } from '../schemas/stroop.trial'
import { evaluateQuality, isReactionTimeWithinBounds } from '../quality/quality-rules'

const WORD_TO_COLOR: Record<StroopTrial['word'], StroopTrial['inkColor']> = {
  红: 'red',
  绿: 'green',
  蓝: 'blue',
  黄: 'yellow',
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Stroop v1：条件、正确性、超时和 Product Index 均由服务端推导。 */
export const scoreStroopV1 = (input: {
  config: StroopConfig
  trials: ScoringTrial<StroopTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials].sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `stroop v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `stroop v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })

  const isCongruent = (trial: StroopTrial): boolean => WORD_TO_COLOR[trial.word] === trial.inkColor
  const isCorrect = (trial: StroopTrial): boolean =>
    trial.response !== null && trial.response === trial.inkColor
  const congruent = sorted.filter((trial) => isCongruent(trial.payload))
  const incongruent = sorted.filter((trial) => !isCongruent(trial.payload))
  const expectedCongruent = Math.round(config.totalTrials * config.congruentRatio)
  if (congruent.length !== expectedCongruent || incongruent.length !== config.totalTrials - expectedCongruent) {
    throw new CognitiveScoringInputError(
      `stroop v1 expects ${expectedCongruent} congruent and ${config.totalTrials - expectedCongruent} incongruent trials`
    )
  }

  const congruentCorrect = congruent.filter((trial) => isCorrect(trial.payload)).length
  const incongruentCorrect = incongruent.filter((trial) => isCorrect(trial.payload)).length
  const accuracy = (congruentCorrect + incongruentCorrect) / sorted.length
  const congruentAccuracy = congruentCorrect / congruent.length
  const incongruentAccuracy = incongruentCorrect / incongruent.length

  const qualityRules = { minReactionTimeMs: config.validRtFloorMs }
  const qualityEvaluation = evaluateQuality(
    {
      reactionTimes: sorted
        .map((trial) => trial.payload.rtMs)
        .filter((rt): rt is number => rt !== null),
      missingTrials: sorted.filter((trial) => trial.payload.rtMs === null).length,
    },
    qualityRules
  )

  const validRts = (trials: ScoringTrial<StroopTrial>[]): number[] =>
    trials
      .filter((trial) => isCorrect(trial.payload) && trial.payload.rtMs !== null)
      .map((trial) => trial.payload.rtMs as number)
      .filter((rt) => isReactionTimeWithinBounds(rt, qualityRules))
  const validCongruentRts = validRts(congruent)
  const validIncongruentRts = validRts(incongruent)
  const medianRtCongruent = median(validCongruentRts)
  const medianRtIncongruent = median(validIncongruentRts)
  const stroopEffectMs =
    medianRtCongruent === null || medianRtIncongruent === null
      ? null
      : medianRtIncongruent - medianRtCongruent

  const insufficientValidCongruentRt = validCongruentRts.length < 2
  const insufficientValidIncongruentRt = validIncongruentRts.length < 2

  return {
    score: Math.round(accuracy * 100),
    metrics: {
      accuracy,
      congruentAccuracy,
      incongruentAccuracy,
      medianRtCongruent,
      medianRtIncongruent,
      stroopEffectMs,
      errorCost: congruentAccuracy - incongruentAccuracy,
      timeoutCount: sorted.filter((trial) => trial.payload.response === null).length,
      validCongruentRtCount: validCongruentRts.length,
      validIncongruentRtCount: validIncongruentRts.length,
    },
    qualityFlags: {
      interpretable: !insufficientValidCongruentRt && !insufficientValidIncongruentRt,
      insufficientValidCongruentRt,
      insufficientValidIncongruentRt,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
      qualityReasons: qualityEvaluation.reasons,
    },
  }
}
