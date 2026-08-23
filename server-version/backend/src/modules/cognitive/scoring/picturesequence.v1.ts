import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { pictureSequenceItems } from '../randomization'
import { PicturesequenceConfig } from '../schemas/picturesequence.config'
import { PicturesequenceTrial } from '../schemas/picturesequence.trial'

const same = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

const validateResponse = (response: string[], expected: string[]) => {
  if (new Set(response).size !== response.length || response.some((item) => !expected.includes(item))) {
    throw new CognitiveScoringInputError('picturesequence v1 response must be a unique subset of the frozen item set')
  }
}

const scores = (response: string[], expected: string[]) => {
  const positions = new Map(expected.map((item, index) => [item, index]))
  let correctPairs = 0
  for (let index = 0; index < response.length - 1; index += 1) {
    if ((positions.get(response[index + 1]) ?? -2) === (positions.get(response[index]) ?? -2) + 1) correctPairs += 1
  }
  const correctPositions = expected.filter((item, index) => response[index] === item).length
  return {
    adjacent: Number((correctPairs / (expected.length - 1)).toFixed(4)),
    position: Number((correctPositions / expected.length).toFixed(4)),
  }
}

export const scorePicturesequenceV1 = (input: {
  config: PicturesequenceConfig
  trials: ScoringTrial<PicturesequenceTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  if (!input.randomSeed) throw new CognitiveScoringInputError('picturesequence v1 requires randomSeed')
  const trials = [...input.trials].sort((a, b) => a.trialIndex - b.trialIndex)
  if (trials.length < input.config.learningRounds || trials.length > input.config.learningRounds + (input.config.delayedEnabled ? 1 : 0)) {
    throw new CognitiveScoringInputError('picturesequence v1 requires every learning round and at most one delayed round')
  }
  const expected = pictureSequenceItems(input.randomSeed, input.config.itemCount)
  trials.forEach((trial, index) => {
    const delayed = index === input.config.learningRounds
    if (trial.trialIndex !== index || trial.payload.phase !== (delayed ? 'delayed' : 'learning')) {
      throw new CognitiveScoringInputError('picturesequence v1 phase path is invalid')
    }
    const expectedRound = delayed ? 1 : index + 1
    if (trial.payload.roundIndex !== expectedRound || !same(trial.payload.itemIds, expected)) {
      throw new CognitiveScoringInputError('picturesequence v1 trial does not match frozen seed sequence')
    }
    validateResponse(trial.payload.responseOrder, expected)
  })

  const learning = trials.slice(0, input.config.learningRounds).map((trial) => scores(trial.payload.responseOrder, expected))
  const first = learning[0]
  const latest = learning[learning.length - 1]
  const delayedTrial = trials[input.config.learningRounds]
  const delayedComplete = Boolean(delayedTrial && !delayedTrial.payload.interrupted && delayedTrial.payload.responseOrder.length === expected.length)
  const delayed = delayedComplete ? scores((delayedTrial as ScoringTrial<PicturesequenceTrial>).payload.responseOrder, expected) : null
  const delayedStageIncomplete = input.config.delayedEnabled && !delayedComplete
  const learningTrials = trials.slice(0, input.config.learningRounds)
  const emptyResponse = learningTrials.some((trial) => trial.payload.responseOrder.length === 0)
  const incompleteResponse = learningTrials.some((trial) => trial.payload.responseOrder.length < expected.length)
  const unchangedIncorrectOrder = learningTrials.length >= 2
    && new Set(learningTrials.map((trial) => trial.payload.responseOrder.join('|'))).size === 1
    && (latest.adjacent + latest.position) / 2 < 0.5
  return {
    score: Math.round(((latest.adjacent + latest.position) / 2) * 100),
    metrics: {
      adjacentPairScore: latest.adjacent,
      positionScore: latest.position,
      learningGain: Number((latest.adjacent - first.adjacent).toFixed(4)),
      adjacentPairScoreByRound: learning.map((item) => item.adjacent),
      positionScoreByRound: learning.map((item) => item.position),
      delayedRetention: delayed ? Number((delayed.adjacent - latest.adjacent).toFixed(4)) : null,
    },
    qualityFlags: {
      interpretable: !incompleteResponse && !unchangedIncorrectOrder,
      emptyResponse,
      incompleteResponse,
      unchangedIncorrectOrder,
      delayedStageIncomplete,
      interrupted: trials.some((trial) => trial.payload.interrupted),
    },
  }
}
