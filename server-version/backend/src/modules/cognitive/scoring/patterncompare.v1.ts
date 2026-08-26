import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { patterncompareTrial } from '../randomization'
import { PatterncompareConfig } from '../schemas/patterncompare.config'
import { PatterncompareTrial } from '../schemas/patterncompare.trial'
import { median } from './signal-detection'

export const scorePatterncompareV1 = (input: {
  config: PatterncompareConfig
  trials: ScoringTrial<PatterncompareTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  if (!input.randomSeed) throw new CognitiveScoringInputError('patterncompare v1 requires session randomSeed')
  const sorted = [...input.trials].sort((a, b) => a.trialIndex - b.trialIndex)
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(`patterncompare v1 requires contiguous trialIndex 0..${sorted.length - 1}`)
    }
    const expected = patterncompareTrial(input.randomSeed as string, index)
    if (
      JSON.stringify(trial.payload.leftPattern) !== JSON.stringify(expected.leftPattern)
      || JSON.stringify(trial.payload.rightPattern) !== JSON.stringify(expected.rightPattern)
    ) {
      throw new CognitiveScoringInputError(`patterncompare v1 trial ${index} does not match the frozen seed sequence`)
    }
  })

  const correct = sorted.filter((trial) => {
    const expected = patterncompareTrial(input.randomSeed as string, trial.trialIndex)
    return trial.payload.response === expected.correctResponse
      && trial.payload.rtMs != null
      && trial.payload.rtMs >= input.config.validRtFloorMs
  })
  const responses = sorted.filter((trial) => trial.payload.response != null)
  const completedTrialCount = sorted.length
  const correctCount = correct.length
  const accuracy = completedTrialCount ? correctCount / completedTrialCount : 0
  const lapseRate = completedTrialCount
    ? sorted.filter((trial) => trial.payload.response == null).length / completedTrialCount
    : 1
  const minimumTrials = Math.max(8, Math.floor(input.config.durationSec / 3))
  const insufficientCompletedTrials = completedTrialCount < minimumTrials
  const lowAccuracy = accuracy < 0.5
  const excessiveLapses = lapseRate >= 0.3
  const constantResponse = responses.length >= 8
    && new Set(responses.map((trial) => trial.payload.response)).size === 1
  const interrupted = sorted.some((trial) => trial.payload.interrupted)

  return {
    score: Math.max(0, Math.min(100, Math.round(accuracy * 100))),
    metrics: {
      correctPerMinute: Math.round((correctCount / input.config.durationSec * 60) * 100) / 100,
      accuracy,
      medianCorrectRtMs: median(correct.map((trial) => trial.payload.rtMs as number)),
      lapseRate,
      correctCount,
      completedTrialCount,
    },
    qualityFlags: {
      interpretable: !insufficientCompletedTrials && !lowAccuracy && !excessiveLapses && !constantResponse,
      insufficientCompletedTrials,
      lowAccuracy,
      excessiveLapses,
      constantResponse,
      interrupted,
    },
  }
}
