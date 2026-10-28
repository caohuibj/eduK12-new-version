import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { SentencecheckConfig } from '../schemas/sentencecheck.config'
import { SentencecheckTrial } from '../schemas/sentencecheck.trial'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const SHAPE_NAMES: Record<SentencecheckTrial['shape'], string> = { circle: '圆形', square: '方形', triangle: '三角形' }
const COLOR_NAMES: Record<SentencecheckTrial['color'], string> = { red: '红色', blue: '蓝色', green: '绿色', yellow: '黄色' }

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const LOW_ACCURACY = 0.5
const MIN_VALID_RT = 2

/** Sentencecheck v1：陈述真伪、正确性与 Product Index 均由服务端推导。 */
export const scoreSentencecheckV1 = (input: {
  config: SentencecheckConfig
  trials: ScoringTrial<SentencecheckTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `sentencecheck v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `sentencecheck v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })

  const actualValue = (trial: SentencecheckTrial): string =>
    trial.questionKind === 'shape' ? SHAPE_NAMES[trial.shape] : COLOR_NAMES[trial.color]
  const statementTrue = (trial: SentencecheckTrial): boolean =>
    trial.negated ? trial.askedValue !== actualValue(trial) : trial.askedValue === actualValue(trial)
  const isCorrect = (trial: SentencecheckTrial): boolean =>
    trial.response !== null && trial.response === statementTrue(trial)

  const expectedTrue = Math.round(config.totalTrials * config.trueRatio)
  const trueStatements = sorted.filter((trial) => statementTrue(trial.payload))
  if (trueStatements.length !== expectedTrue || sorted.length - trueStatements.length !== config.totalTrials - expectedTrue) {
    throw new CognitiveScoringInputError(
      `sentencecheck v1 expects ${expectedTrue} matching and ${config.totalTrials - expectedTrue} non-matching statements`
    )
  }

  const correctCount = sorted.filter((trial) => isCorrect(trial.payload)).length
  const accuracy = correctCount / sorted.length

  const validRts = (trials: ScoringTrial<SentencecheckTrial>[]): number[] =>
    trials
      .filter((trial) => isCorrect(trial.payload) && trial.payload.rtMs !== null)
      .map((trial) => trial.payload.rtMs as number)
      .filter((rt) => rt >= config.validRtFloorMs)
  const negated = sorted.filter((trial) => trial.payload.negated)
  const affirmative = sorted.filter((trial) => !trial.payload.negated)
  const negatedRts = validRts(negated)
  const affirmativeRts = validRts(affirmative)
  const medianRtNegated = median(negatedRts)
  const medianRtAffirmative = median(affirmativeRts)
  const negationPenaltyMs = medianRtNegated === null || medianRtAffirmative === null ? null : medianRtNegated - medianRtAffirmative

  const validCorrectRts = validRts(sorted)
  const insufficientValidRt = validCorrectRts.length < MIN_VALID_RT
  const lowAccuracy = accuracy < LOW_ACCURACY

  return {
    score: Math.round(accuracy * 100),
    metrics: {
      accuracy,
      medianRtMs: median(validCorrectRts),
      negationPenaltyMs,
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
