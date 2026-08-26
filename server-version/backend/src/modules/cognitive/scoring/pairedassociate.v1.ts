import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { pairedAssociateSet } from '../randomization'
import { PairedassociateConfig } from '../schemas/pairedassociate.config'
import { PairedassociateTrial } from '../schemas/pairedassociate.trial'

export const scorePairedassociateV1 = (input: {
  config: PairedassociateConfig
  trials: ScoringTrial<PairedassociateTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  if (!input.randomSeed) throw new CognitiveScoringInputError('pairedassociate v1 requires randomSeed')
  const trials = [...input.trials].sort((a, b) => a.trialIndex - b.trialIndex)
  if (trials.length < input.config.learningRounds || trials.length > input.config.learningRounds + (input.config.delayedEnabled ? 1 : 0)) {
    throw new CognitiveScoringInputError('pairedassociate v1 requires every learning round and at most one delayed round')
  }
  const expected = pairedAssociateSet(input.randomSeed, input.config.pairCount)
  const answer = new Map(expected.map((item) => [item.itemId, item.targetPosition]))
  const accuracies: number[] = []
  trials.forEach((trial, index) => {
    const delayed = index === input.config.learningRounds
    if (trial.trialIndex !== index || trial.payload.phase !== (delayed ? 'delayed' : 'learning')) {
      throw new CognitiveScoringInputError('pairedassociate v1 phase path is invalid')
    }
    if (trial.payload.roundIndex !== (delayed ? 1 : index + 1)) {
      throw new CognitiveScoringInputError('pairedassociate v1 roundIndex is invalid')
    }
    const ids = trial.payload.responses.map((item) => item.itemId)
    if (ids.length !== expected.length || new Set(ids).size !== ids.length || ids.some((item, itemIndex) => item !== expected[itemIndex].itemId)) {
      throw new CognitiveScoringInputError('pairedassociate v1 responses do not match frozen seed item order')
    }
    if (trial.payload.responses.some((item) => item.selectedPosition != null && item.selectedPosition >= input.config.pairCount)) {
      throw new CognitiveScoringInputError('pairedassociate v1 selectedPosition is outside the frozen board')
    }
    const correct = trial.payload.responses.filter((item) => item.selectedPosition === answer.get(item.itemId)).length
    accuracies.push(Number((correct / input.config.pairCount).toFixed(4)))
  })

  const learning = accuracies.slice(0, input.config.learningRounds)
  const delayedTrial = trials[input.config.learningRounds]
  const delayedComplete = Boolean(delayedTrial && !delayedTrial.payload.interrupted && delayedTrial.payload.responses.every((item) => item.selectedPosition != null))
  const delayedAccuracy = delayedComplete ? accuracies[input.config.learningRounds] : null
  const latest = learning[learning.length - 1]
  const learningSlope = learning.length > 1 ? Number(((latest - learning[0]) / (learning.length - 1)).toFixed(4)) : 0
  const criterionIndex = learning.findIndex((accuracy) => accuracy >= 0.8)
  const delayedStageIncomplete = input.config.delayedEnabled && !delayedComplete
  const learningTrials = trials.slice(0, input.config.learningRounds)
  const excessiveOmissions = learningTrials.some((trial) => trial.payload.responses.filter((item) => item.selectedPosition == null).length / input.config.pairCount >= 0.5)
  const selectedLearningPositions = learningTrials.flatMap((trial) => trial.payload.responses.map((item) => item.selectedPosition).filter((position): position is number => position != null))
  const constantPositionResponse = selectedLearningPositions.length >= input.config.pairCount && new Set(selectedLearningPositions).size === 1
  return {
    score: Math.round(latest * 100),
    metrics: {
      correctByTrial: learning.map((accuracy) => Math.round(accuracy * input.config.pairCount)),
      learningSlope,
      trialsToCriterion: criterionIndex < 0 ? null : criterionIndex + 1,
      immediateAccuracy: latest,
      delayedAccuracy,
    },
    qualityFlags: {
      interpretable: !excessiveOmissions && !constantPositionResponse,
      excessiveOmissions,
      constantPositionResponse,
      delayedStageIncomplete,
      interrupted: trials.some((trial) => trial.payload.interrupted),
    },
  }
}
