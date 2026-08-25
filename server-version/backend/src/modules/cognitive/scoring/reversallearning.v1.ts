import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { reversallearningSequence } from '../randomization'
import { ReversallearningConfig } from '../schemas/reversallearning.config'
import { ReversallearningTrial } from '../schemas/reversallearning.trial'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

const trialsToCriterion = (
  trials: Array<{ correct: boolean }>,
  criterion: number,
): number | null => {
  let streak = 0
  for (let index = 0; index < trials.length; index += 1) {
    streak = trials[index].correct ? streak + 1 : 0
    if (streak >= criterion) return index + 1
  }
  return null
}

export const scoreReversallearningV1 = (input: {
  config: ReversallearningConfig
  trials: ScoringTrial<ReversallearningTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  if (!input.randomSeed) throw new CognitiveScoringInputError('reversallearning v1 requires randomSeed')
  const expected = reversallearningSequence(
    input.randomSeed,
    input.config.totalTrials,
    input.config.acquisitionTrials,
    input.config.reversalTrials,
    input.config.rewardProbability,
  )
  const trials = [...input.trials].sort((left, right) => left.trialIndex - right.trialIndex)
  if (trials.length !== expected.length) throw new CognitiveScoringInputError('reversallearning v1 requires the configured trial count')

  const acquisition = { correct: 0, valid: 0, feedbackWins: 0, observations: [] as Array<{ correct: boolean }> }
  const reversal = { correct: 0, valid: 0, feedbackWins: 0, observations: [] as Array<{ correct: boolean }> }
  const responseValues: string[] = []
  const rtValues: number[] = []
  let omissions = 0
  let perseverativeErrorCount = 0
  let interrupted = false

  trials.forEach((trial, index) => {
    if (trial.trialIndex !== index) throw new CognitiveScoringInputError('reversallearning v1 requires contiguous trialIndex values')
    const spec = expected[index]
    const bucket = spec.segment === 'acquisition' ? acquisition : reversal
    const choice = trial.payload.choice
    interrupted = interrupted || trial.payload.interrupted
    if (choice == null || (trial.payload.rtMs != null && trial.payload.rtMs > input.config.trialTimeoutMs)) {
      omissions += 1
      bucket.observations.push({ correct: false })
      return
    }
    const correct = choice === spec.correctResponse
    const feedbackWin = correct && spec.rewardRoll < input.config.rewardProbability
    bucket.valid += 1
    bucket.correct += correct ? 1 : 0
    bucket.feedbackWins += feedbackWin ? 1 : 0
    bucket.observations.push({ correct })
    responseValues.push(choice)
    if (trial.payload.rtMs != null) rtValues.push(trial.payload.rtMs)
    if (spec.segment === 'reversal' && choice === spec.acquisitionResponse) perseverativeErrorCount += 1
  })

  const acquisitionAccuracy = acquisition.correct / input.config.acquisitionTrials
  const reversalAccuracy = reversal.correct / input.config.reversalTrials
  const overallAccuracy = (acquisition.correct + reversal.correct) / expected.length
  const omissionRate = omissions / expected.length
  const insufficientAcquisitionTrials = acquisition.valid < Math.ceil(input.config.acquisitionTrials * 0.7)
  const insufficientReversalTrials = reversal.valid < Math.ceil(input.config.reversalTrials * 0.7)
  const lowAccuracy = overallAccuracy < 0.5
  const excessiveOmissions = omissionRate >= 0.3
  const constantChoice = responseValues.length >= 8 && new Set(responseValues).size === 1
  const acquisitionCriterion = trialsToCriterion(acquisition.observations, input.config.criterionConsecutiveCorrect)
  const reversalCriterion = trialsToCriterion(reversal.observations, input.config.criterionConsecutiveCorrect)
  const noAcquisitionCriterion = acquisitionCriterion == null
  const noReversalCriterion = reversalCriterion == null

  return {
    score: Math.max(0, Math.min(100, Math.round((acquisitionAccuracy * 0.4 + reversalAccuracy * 0.6) * 100))),
    metrics: {
      acquisitionAccuracy: Number(acquisitionAccuracy.toFixed(4)),
      reversalAccuracy: Number(reversalAccuracy.toFixed(4)),
      reversalCost: Number((acquisitionAccuracy - reversalAccuracy).toFixed(4)),
      perseverativeErrorCount,
      trialsToAcquisitionCriterion: acquisitionCriterion,
      trialsToReversalCriterion: reversalCriterion,
      feedbackWinRate: (acquisition.valid + reversal.valid) === 0
        ? null
        : Number(((acquisition.feedbackWins + reversal.feedbackWins) / (acquisition.valid + reversal.valid)).toFixed(4)),
      omissionRate: Number(omissionRate.toFixed(4)),
      medianRtMs: median(rtValues),
      validResponseCount: acquisition.valid + reversal.valid,
    },
    qualityFlags: {
      interpretable: !insufficientAcquisitionTrials && !insufficientReversalTrials && !lowAccuracy && !excessiveOmissions && !constantChoice && !noAcquisitionCriterion && !noReversalCriterion && !interrupted,
      insufficientAcquisitionTrials,
      insufficientReversalTrials,
      lowAccuracy,
      excessiveOmissions,
      constantChoice,
      noAcquisitionCriterion,
      noReversalCriterion,
      interrupted,
    },
  }
}
