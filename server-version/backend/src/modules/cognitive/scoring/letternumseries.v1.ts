import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { LetternumseriesConfig } from '../schemas/letternumseries.config'
import { LetternumseriesTrial } from '../schemas/letternumseries.trial'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const round = (value: number): number => Number(value.toFixed(4))

const LETTER_SORT = (a: string, b: string): number => a.localeCompare(b, 'en-US')

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const EMPTY_RECALL = 0.5

/** Letternumseries v1：字母序/数字序正确性由服务端推导（WAIS LNS 结构）。 */
export const scoreLetternumseriesV1 = (input: {
  config: LetternumseriesConfig
  trials: ScoringTrial<LetternumseriesTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `letternumseries v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `letternumseries v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
    const { sequence } = trial.payload
    const letters = sequence.filter((item) => /[A-Za-z]/.test(item))
    const digits = sequence.filter((item) => /[0-9]/.test(item))
    if (letters.length !== config.lettersPerTrial || digits.length !== config.digitsPerTrial) {
      throw new CognitiveScoringInputError(
        `letternumseries v1 trial ${index} sequence composition does not match the frozen config`
      )
    }
  })

  let lettersCorrect = 0
  let digitsCorrect = 0
  let lettersTotal = 0
  let digitsTotal = 0
  let emptyResponses = 0
  const durations: number[] = []

  for (const trial of sorted) {
    const { sequence, lettersResponse, digitsResponse, responseDurationMs, interrupted } = trial.payload
    if (interrupted) continue
    const targetLetters = sequence.filter((item) => /[A-Za-z]/.test(item)).sort(LETTER_SORT)
    const targetDigits = sequence.filter((item) => /[0-9]/.test(item)).sort((a, b) => Number(a) - Number(b))
    durations.push(responseDurationMs)
    if (lettersResponse.length === 0 && digitsResponse.length === 0) emptyResponses += 1
    targetLetters.forEach((letter, slot) => {
      lettersTotal += 1
      if (lettersResponse[slot] === letter) lettersCorrect += 1
    })
    targetDigits.forEach((digit, slot) => {
      digitsTotal += 1
      if (digitsResponse[slot] === digit) digitsCorrect += 1
    })
  }

  const overallAccuracy = lettersTotal + digitsTotal === 0 ? null : round((lettersCorrect + digitsCorrect) / (lettersTotal + digitsTotal))
  const lettersAccuracy = lettersTotal === 0 ? null : round(lettersCorrect / lettersTotal)
  const digitsAccuracy = digitsTotal === 0 ? null : round(digitsCorrect / digitsTotal)
  const medianResponseMs = median(durations)

  return {
    score: overallAccuracy === null ? 0 : Math.round(overallAccuracy * 100),
    metrics: {
      overallAccuracy,
      lettersAccuracy,
      digitsAccuracy,
      emptyRecallCount: emptyResponses,
      medianResponseMs,
    },
    qualityFlags: {
      interpretable: overallAccuracy !== null && emptyResponses / config.totalTrials < EMPTY_RECALL,
      emptyRecallExcess: emptyResponses / config.totalTrials >= EMPTY_RECALL,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
