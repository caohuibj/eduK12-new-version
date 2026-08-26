import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { digitBackwardSequence } from '../randomization'
import { DigitbackwardConfig } from '../schemas/digitbackward.config'
import { DigitbackwardTrial } from '../schemas/digitbackward.trial'

const same = (left: number[], right: number[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

const sequenceDistance = (expected: number[], actual: number[]) => {
  const length = Math.max(expected.length, actual.length)
  let distance = 0
  for (let index = 0; index < length; index += 1) if (expected[index] !== actual[index]) distance += 1
  return distance
}

export const scoreDigitbackwardV1 = (input: {
  config: DigitbackwardConfig
  trials: ScoringTrial<DigitbackwardTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  if (!input.randomSeed) throw new CognitiveScoringInputError('digitbackward v1 requires randomSeed')
  const trials = [...input.trials].sort((a, b) => a.trialIndex - b.trialIndex)
  if (trials.length < 2 || trials.length % input.config.trialsPerLevel !== 0) {
    throw new CognitiveScoringInputError('digitbackward v1 requires complete two-trial levels')
  }

  let maxSpan = 0
  let totalCorrectTrials = 0
  let interruptedCount = 0
  let totalSequenceDistance = 0
  for (let index = 0; index < trials.length; index += 1) {
    const trial = trials[index]
    const level = Math.floor(index / 2)
    const expectedSpan = input.config.startSpan + level
    const expectedWithinLevel = (index % 2) + 1
    if (trial.trialIndex !== index || trial.payload.spanLength !== expectedSpan || trial.payload.trialWithinLevel !== expectedWithinLevel) {
      throw new CognitiveScoringInputError('digitbackward v1 trial path does not match configured span progression')
    }
    const expectedSequence = digitBackwardSequence(input.randomSeed, index, expectedSpan)
    if (!same(trial.payload.sequence, expectedSequence)) {
      throw new CognitiveScoringInputError('digitbackward v1 trial does not match frozen seed sequence')
    }
    const expectedResponse = [...expectedSequence].reverse()
    const correct = same(trial.payload.response, expectedResponse)
    if (correct) {
      totalCorrectTrials += 1
      maxSpan = Math.max(maxSpan, expectedSpan)
    }
    totalSequenceDistance += sequenceDistance(expectedResponse, trial.payload.response)
    if (trial.payload.interrupted) interruptedCount += 1
  }

  for (let start = 0; start < trials.length; start += 2) {
    const correctInLevel = trials.slice(start, start + 2).filter((trial) => {
      const expected = [...digitBackwardSequence(input.randomSeed as string, trial.trialIndex, trial.payload.spanLength)].reverse()
      return same(trial.payload.response, expected)
    }).length
    const span = trials[start].payload.spanLength
    const hasNext = start + 2 < trials.length
    if ((correctInLevel === 0 || span === input.config.maxSpan) && hasNext) {
      throw new CognitiveScoringInputError('digitbackward v1 contains trials after terminal level')
    }
    if (correctInLevel > 0 && span < input.config.maxSpan && !hasNext) {
      throw new CognitiveScoringInputError('digitbackward v1 stopped before a terminal level')
    }
  }

  const repeatedIncorrect = trials.filter((trial) => trial.payload.response.length > 0).map((trial) => trial.payload.response.join(','))
  const constantResponse = repeatedIncorrect.length >= 4 && new Set(repeatedIncorrect).size === 1
  const insufficientCompletedLevels = trials.length < 4
  return {
    score: Math.round((maxSpan / input.config.maxSpan) * 100),
    metrics: {
      maxSpan,
      totalCorrectTrials,
      sequenceDistance: Number((totalSequenceDistance / trials.length).toFixed(3)),
      medianResponseDurationMs: median(trials.map((trial) => trial.payload.responseDurationMs)),
      completedLevelCount: trials.length / 2,
    },
    qualityFlags: {
      interpretable: !insufficientCompletedLevels && !constantResponse,
      insufficientCompletedLevels,
      constantResponse,
      interrupted: interruptedCount > 0,
    },
  }
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
