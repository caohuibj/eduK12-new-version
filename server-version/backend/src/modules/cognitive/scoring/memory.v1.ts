import {
  CognitiveScoreResult,
  CognitiveScoringInputError,
  ScoringTrial,
} from '../cognitive.types'
import { MemoryConfig } from '../schemas/memory.config'
import { MemoryTrial } from '../schemas/memory.trial'

const sequenceMatches = (left: number[], right: number[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Digit Span Forward v1：每个长度固定两题，服务端重建升级与终止路径。 */
export const scoreMemoryV1 = (input: {
  config: MemoryConfig
  trials: ScoringTrial<MemoryTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials].sort((a, b) => a.trialIndex - b.trialIndex)

  if (sorted.length < config.trialsPerLevel) {
    throw new CognitiveScoringInputError('memory v1 requires a complete two-trial level')
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `memory v1 requires contiguous trialIndex 0..${sorted.length - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })

  if (sorted[0].payload.length !== config.startLength || sorted[0].payload.trialWithinLevel !== 1) {
    throw new CognitiveScoringInputError(
      `memory v1 must start at length ${config.startLength}, trialWithinLevel 1`
    )
  }

  let levelStart = 0
  let maxSpan = 0
  let levelsPassed = 0
  let firstTryPassCount = 0
  let interruptedCount = 0
  const responseDurations: number[] = []

  while (levelStart < sorted.length) {
    const first = sorted[levelStart]
    const second = sorted[levelStart + 1]
    if (!second || first.payload.trialWithinLevel !== 1 || second.payload.trialWithinLevel !== 2) {
      throw new CognitiveScoringInputError('memory v1 requires exactly trialWithinLevel 1 then 2')
    }
    if (first.payload.length !== second.payload.length) {
      throw new CognitiveScoringInputError('memory v1 level trials must have the same length')
    }

    const levelTrials = [first, second]
    const correctCount = levelTrials.filter((trial) =>
      sequenceMatches(trial.payload.sequence, trial.payload.response)
    ).length

    levelTrials.forEach((trial, position) => {
      if (trial.trialIndex !== levelStart + position) {
        throw new CognitiveScoringInputError('memory v1 trial indexes must be contiguous')
      }
      const payload = trial.payload
      if (payload.length < config.startLength || payload.length > config.maxLength) {
        throw new CognitiveScoringInputError(
          `memory v1 trial ${trial.trialIndex} length ${payload.length} is outside configured range`
        )
      }
      if (payload.trialWithinLevel > config.trialsPerLevel) {
        throw new CognitiveScoringInputError('memory v1 trialWithinLevel exceeds trialsPerLevel')
      }
      if (payload.trialWithinLevel === 1 && sequenceMatches(payload.sequence, payload.response)) {
        firstTryPassCount += 1
      }
      if (payload.interrupted) interruptedCount += 1
      responseDurations.push(payload.responseDurationMs)
    })

    const levelLength = first.payload.length
    if (correctCount > 0) {
      levelsPassed += 1
      maxSpan = Math.max(maxSpan, levelLength)
    }

    const terminal = correctCount === 0 || levelLength === config.maxLength
    const next = sorted[levelStart + 2]?.payload
    if (terminal) {
      if (next) throw new CognitiveScoringInputError('memory v1 contains a trial after the terminal level')
      break
    }

    if (!next || next.length !== levelLength + 1 || next.trialWithinLevel !== 1) {
      throw new CognitiveScoringInputError(
        `memory v1 must advance from length ${levelLength} to trialWithinLevel 1 of ${levelLength + 1}`
      )
    }
    levelStart += config.trialsPerLevel
  }

  return {
    score: Math.round((maxSpan / config.maxLength) * 100),
    metrics: {
      maxSpan,
      levelsPassed,
      firstTryPassCount,
      trialCount: sorted.length,
      interruptedCount,
      medianResponseDurationMs: median(responseDurations),
    },
    qualityFlags: {
      interpretable: true,
      interrupted: interruptedCount > 0,
    },
  }
}
