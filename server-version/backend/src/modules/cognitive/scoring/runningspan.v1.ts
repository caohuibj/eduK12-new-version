import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { RunningspanConfig } from '../schemas/runningspan.config'
import { RunningspanTrial } from '../schemas/runningspan.trial'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const round = (value: number): number => Number(value.toFixed(4))

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const MAX_INTRUSION_RATE = 0.5

/** Runningspan v1：串行正确性、侵入与 Product Index 均由服务端推导。 */
export const scoreRunningspanV1 = (input: {
  config: RunningspanConfig
  trials: ScoringTrial<RunningspanTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `runningspan v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `runningspan v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
    const { sequence, response } = trial.payload
    if (sequence.length < config.listLengthMin || sequence.length > config.listLengthMax) {
      throw new CognitiveScoringInputError(
        `runningspan v1 trial ${index} sequence length ${sequence.length} outside frozen range [${config.listLengthMin}, ${config.listLengthMax}]`
      )
    }
    if (response.length > config.recallLength) {
      throw new CognitiveScoringInputError(`runningspan v1 trial ${index} response longer than recallLength`)
    }
  })

  let totalCorrectPositions = 0
  let totalRecallSlots = 0
  let totalIntrusions = 0
  let emptyRecall = false
  const durations: number[] = []

  for (const trial of sorted) {
    const { sequence, response, responseDurationMs, interrupted } = trial.payload
    if (interrupted) continue
    const window = sequence.slice(-config.recallLength)
    durations.push(responseDurationMs)
    if (response.length === 0) emptyRecall = true
    response.forEach((letter, slot) => {
      totalRecallSlots += 1
      if (window[slot] === letter) totalCorrectPositions += 1
      else if (!window.includes(letter)) totalIntrusions += 1
    })
  }

  const runningSpanAccuracy = totalRecallSlots === 0 ? null : round(totalCorrectPositions / totalRecallSlots)
  const intrusionRate = totalRecallSlots === 0 ? null : round(totalIntrusions / totalRecallSlots)
  const medianResponseMs = median(durations)

  return {
    score: runningSpanAccuracy === null ? 0 : Math.round(runningSpanAccuracy * 100),
    metrics: {
      runningSpanAccuracy,
      totalCorrectPositions,
      intrusionRate,
      medianResponseMs,
    },
    qualityFlags: {
      interpretable: !emptyRecall && (intrusionRate ?? 0) < MAX_INTRUSION_RATE,
      emptyRecall,
      excessiveIntrusions: (intrusionRate ?? 0) >= MAX_INTRUSION_RATE,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
