import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { corsiSequence } from '../randomization'
import { CorsiConfig } from '../schemas/corsi.config'
import { CorsiTrial } from '../schemas/corsi.trial'
import { median } from './signal-detection'

const sequenceMatches = (left: number[], right: number[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const mismatchDistance = (sequence: number[], response: number[]): number => {
  const length = Math.max(sequence.length, response.length)
  if (length === 0) return 0
  let distance = Math.abs(sequence.length - response.length)
  const shared = Math.min(sequence.length, response.length)
  for (let index = 0; index < shared; index += 1) {
    if (sequence[index] !== response[index]) distance += 1
  }
  return distance / length
}

const hasInvalidBlocks = (response: number[], boardSize: number): boolean =>
  response.some((id) => id < 0 || id >= boardSize) || new Set(response).size !== response.length

export const scoreCorsiV1 = (input: {
  config: CorsiConfig
  trials: ScoringTrial<CorsiTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  const { config } = input
  if (!input.randomSeed) {
    throw new CognitiveScoringInputError('corsi v1 requires session randomSeed')
  }
  const sorted = [...input.trials].sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length < config.trialsPerLevel) {
    throw new CognitiveScoringInputError('corsi v1 requires a complete two-trial level')
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(`corsi v1 requires contiguous trialIndex 0..${sorted.length - 1}`)
    }
    const expected = corsiSequence(input.randomSeed as string, trial.trialIndex, trial.payload.spanLength, config.boardSize)
    if (!sequenceMatches(trial.payload.sequence, expected)) {
      throw new CognitiveScoringInputError(`corsi v1 trial ${index} sequence does not match the frozen seed`)
    }
  })
  if (sorted[0].payload.spanLength !== config.startSpan || sorted[0].payload.trialWithinLevel !== 1) {
    throw new CognitiveScoringInputError(`corsi v1 must start at span ${config.startSpan}, trialWithinLevel 1`)
  }

  let levelStart = 0
  let maxSpan = 0
  let firstTryPassCount = 0
  let totalCorrectTrials = 0
  const distances: number[] = []
  const durations: number[] = []
  let invalidBlockSequence = false
  let interruptedCount = 0

  while (levelStart < sorted.length) {
    const first = sorted[levelStart]
    const second = sorted[levelStart + 1]
    if (!second || first.payload.trialWithinLevel !== 1 || second.payload.trialWithinLevel !== 2) {
      throw new CognitiveScoringInputError('corsi v1 requires exactly trialWithinLevel 1 then 2')
    }
    if (first.payload.spanLength !== second.payload.spanLength) {
      throw new CognitiveScoringInputError('corsi v1 level trials must have the same spanLength')
    }
    const levelTrials = [first, second]
    const correctCount = levelTrials.filter((trial) => sequenceMatches(trial.payload.sequence, trial.payload.response)).length
    levelTrials.forEach((trial) => {
      if (trial.payload.spanLength < config.startSpan || trial.payload.spanLength > config.maxSpan) {
        throw new CognitiveScoringInputError(`corsi v1 trial ${trial.trialIndex} span is outside configured range`)
      }
      if (hasInvalidBlocks(trial.payload.response, config.boardSize)) invalidBlockSequence = true
      if (trial.payload.interrupted) interruptedCount += 1
      durations.push(trial.payload.responseDurationMs)
      if (sequenceMatches(trial.payload.sequence, trial.payload.response)) totalCorrectTrials += 1
      else distances.push(mismatchDistance(trial.payload.sequence, trial.payload.response))
    })
    if (sequenceMatches(first.payload.sequence, first.payload.response)) firstTryPassCount += 1
    if (correctCount > 0) maxSpan = Math.max(maxSpan, first.payload.spanLength)

    const terminal = correctCount === 0 || first.payload.spanLength === config.maxSpan
    const next = sorted[levelStart + 2]?.payload
    if (terminal) {
      if (next) throw new CognitiveScoringInputError('corsi v1 contains a trial after the terminal level')
      break
    }
    if (!next || next.spanLength !== first.payload.spanLength + 1 || next.trialWithinLevel !== 1) {
      throw new CognitiveScoringInputError(
        `corsi v1 must advance from span ${first.payload.spanLength} to trialWithinLevel 1 of ${first.payload.spanLength + 1}`,
      )
    }
    levelStart += config.trialsPerLevel
  }

  const completedLevels = sorted.length / config.trialsPerLevel
  const insufficientCompletedLevels = completedLevels < 2
  const sequenceErrorDistance = distances.length ? Math.round((distances.reduce((sum, value) => sum + value, 0) / distances.length) * 1000) / 1000 : 0

  return {
    score: Math.round((maxSpan / config.maxSpan) * 100),
    metrics: {
      maxSpan,
      totalCorrectTrials,
      firstTryPassCount,
      medianResponseDurationMs: median(durations),
      sequenceErrorDistance,
      trialCount: sorted.length,
    },
    qualityFlags: {
      interpretable: !insufficientCompletedLevels && !invalidBlockSequence,
      insufficientCompletedLevels,
      invalidBlockSequence,
      interrupted: interruptedCount > 0,
    },
  }
}
