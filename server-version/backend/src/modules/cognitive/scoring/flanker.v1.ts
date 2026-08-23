import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { flankerSequence } from '../randomization'
import { FlankerConfig } from '../schemas/flanker.config'
import { FlankerTrial } from '../schemas/flanker.trial'
import { median } from './signal-detection'

export const scoreFlankerV1 = (input: {
  config: FlankerConfig
  trials: ScoringTrial<FlankerTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  if (!input.randomSeed) throw new CognitiveScoringInputError('flanker v1 requires session randomSeed')
  const expected = flankerSequence(input.randomSeed, input.config.totalTrials)
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < input.config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== input.config.totalTrials) {
    throw new CognitiveScoringInputError(`flanker v1 expects exactly ${input.config.totalTrials} trials, got ${sorted.length}`)
  }
  sorted.forEach((trial, index) => {
    const want = expected[index]
    if (
      trial.trialIndex !== index
      || trial.payload.targetDirection !== want.targetDirection
      || trial.payload.flankerDirection !== want.flankerDirection
    ) {
      throw new CognitiveScoringInputError(`flanker v1 trial ${index} does not match the frozen seed sequence`)
    }
  })

  const isCorrect = (trial: ScoringTrial<FlankerTrial>) => {
    const want = expected[trial.trialIndex]
    return trial.payload.response === want.correctResponse
      && trial.payload.rtMs != null
      && trial.payload.rtMs >= input.config.validRtFloorMs
  }
  const congruent = sorted.filter((trial) => trial.payload.targetDirection === trial.payload.flankerDirection)
  const incongruent = sorted.filter((trial) => trial.payload.targetDirection !== trial.payload.flankerDirection)
  const congruentCorrect = congruent.filter(isCorrect)
  const incongruentCorrect = incongruent.filter(isCorrect)
  const congruentAccuracy = congruentCorrect.length / congruent.length
  const incongruentAccuracy = incongruentCorrect.length / incongruent.length
  const accuracy = (congruentCorrect.length + incongruentCorrect.length) / sorted.length
  const medianRtCongruent = median(congruentCorrect.map((trial) => trial.payload.rtMs as number))
  const medianRtIncongruent = median(incongruentCorrect.map((trial) => trial.payload.rtMs as number))
  const flankerEffectMs = medianRtCongruent != null && medianRtIncongruent != null
    ? medianRtIncongruent - medianRtCongruent
    : null
  const omissionRate = sorted.filter((trial) => trial.payload.response == null).length / sorted.length
  const minimumConditionCorrect = Math.max(4, Math.floor(input.config.totalTrials * 0.1))
  const insufficientCongruentTrials = congruentCorrect.length < minimumConditionCorrect
  const insufficientIncongruentTrials = incongruentCorrect.length < minimumConditionCorrect
  const lowAccuracy = accuracy < 0.5
  const excessiveOmissions = omissionRate >= 0.3
  const responses = sorted.flatMap((trial) => trial.payload.response ? [trial.payload.response] : [])
  const constantResponse = responses.length >= 8 && new Set(responses).size === 1
  const interrupted = sorted.some((trial) => trial.payload.interrupted)

  return {
    score: Math.max(0, Math.min(100, Math.round(incongruentAccuracy * 60 + congruentAccuracy * 40))),
    metrics: {
      flankerEffectMs,
      incongruentAccuracy,
      congruentAccuracy,
      errorCost: congruentAccuracy - incongruentAccuracy,
      accuracy,
      medianRtCongruent,
      medianRtIncongruent,
      omissionRate,
    },
    qualityFlags: {
      interpretable: !insufficientCongruentTrials
        && !insufficientIncongruentTrials
        && !lowAccuracy
        && !excessiveOmissions
        && !constantResponse,
      insufficientCongruentTrials,
      insufficientIncongruentTrials,
      lowAccuracy,
      excessiveOmissions,
      constantResponse,
      interrupted,
    },
  }
}
