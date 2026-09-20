import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { cardsortCorrectResponse, cardsortSequence } from '../randomization'
import { CardsortConfig } from '../schemas/cardsort.config'
import { CardsortTrial } from '../schemas/cardsort.trial'
import { median } from './signal-detection'

export const scoreCardsortV1 = (input: {
  config: CardsortConfig
  trials: ScoringTrial<CardsortTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  if (!input.randomSeed) throw new CognitiveScoringInputError('cardsort v1 requires session randomSeed')
  const expected = cardsortSequence(input.randomSeed, input.config.totalTrials, input.config.blockCount, input.config.switchRatio)
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < input.config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== input.config.totalTrials) {
    throw new CognitiveScoringInputError(`cardsort v1 expects exactly ${input.config.totalTrials} trials, got ${sorted.length}`)
  }
  sorted.forEach((trial, index) => {
    const want = expected[index]
    if (
      trial.trialIndex !== index
      || trial.payload.ruleCue !== want.ruleCue
      || trial.payload.stimulusColor !== want.stimulusColor
      || trial.payload.stimulusShape !== want.stimulusShape
    ) {
      throw new CognitiveScoringInputError(`cardsort v1 trial ${index} does not match the frozen seed sequence`)
    }
  })

  const isCorrect = (trial: ScoringTrial<CardsortTrial>) => {
    const want = expected[trial.trialIndex]
    return trial.payload.response === want.correctResponse
      && trial.payload.rtMs != null
      && trial.payload.rtMs >= input.config.validRtFloorMs
  }
  const hasRuleConflict = (trial: ScoringTrial<CardsortTrial>) => {
    const spec = expected[trial.trialIndex]
    const colorResponse = cardsortCorrectResponse('color', spec.stimulusColor, spec.stimulusShape)
    const shapeResponse = cardsortCorrectResponse('shape', spec.stimulusColor, spec.stimulusShape)
    return colorResponse !== shapeResponse
  }

  const switchTrials = sorted.filter((trial) => expected[trial.trialIndex].switchType === 'switch')
  const repeatTrials = sorted.filter((trial) => expected[trial.trialIndex].switchType === 'repeat')
  const conflictRepeatTrials = repeatTrials.filter(hasRuleConflict)
  const switchCorrect = switchTrials.filter(isCorrect)
  const conflictRepeatCorrect = conflictRepeatTrials.filter(isCorrect)
  const accuracySwitch = switchTrials.length ? switchCorrect.length / switchTrials.length : 0
  const accuracyRepeat = conflictRepeatTrials.length ? conflictRepeatCorrect.length / conflictRepeatTrials.length : 0
  const medianRtSwitch = median(switchCorrect.map((trial) => trial.payload.rtMs as number))
  const medianRtRepeat = median(conflictRepeatCorrect.map((trial) => trial.payload.rtMs as number))
  const switchCostRtMs = medianRtSwitch != null && medianRtRepeat != null ? medianRtSwitch - medianRtRepeat : null

  const postSwitchTrials = sorted.filter((trial) => {
    const spec = expected[trial.trialIndex]
    const previous = trial.trialIndex > 0 ? expected[trial.trialIndex - 1] : null
    return spec.switchType === 'repeat' && previous?.switchType === 'switch'
  }).filter(hasRuleConflict)
  const postSwitchAccuracy = postSwitchTrials.length ? postSwitchTrials.filter(isCorrect).length / postSwitchTrials.length : null

  const conflictSwitchTrials = switchTrials.filter(hasRuleConflict)
  const perseverativeErrors = conflictSwitchTrials.filter((trial) => {
    const spec = expected[trial.trialIndex]
    return spec.previousRuleResponse != null
      && trial.payload.response === spec.previousRuleResponse
      && trial.payload.response !== spec.correctResponse
  }).length
  const perseverativeErrorRate = conflictSwitchTrials.length ? perseverativeErrors / conflictSwitchTrials.length : 0

  const overallAccuracy = sorted.length ? sorted.filter(isCorrect).length / sorted.length : 0
  const omissionRate = sorted.filter((trial) => trial.payload.response == null).length / sorted.length
  const insufficientSwitchTrials = switchCorrect.length < Math.max(3, Math.floor(switchTrials.length * 0.25))
  const insufficientRepeatTrials = conflictRepeatCorrect.length < Math.max(3, Math.floor(conflictRepeatTrials.length * 0.25))
  const lowAccuracy = overallAccuracy < 0.5
  const excessiveOmissions = omissionRate >= 0.3
  const responses = sorted.flatMap((trial) => trial.payload.response ? [trial.payload.response] : [])
  const constantResponse = responses.length >= 8 && new Set(responses).size === 1
  const interrupted = sorted.some((trial) => trial.payload.interrupted)

  return {
    score: Math.max(0, Math.min(100, Math.round(accuracySwitch * 60 + accuracyRepeat * 40))),
    metrics: {
      switchCostRtMs,
      switchCostAccuracy: accuracyRepeat - accuracySwitch,
      perseverativeErrorRate,
      postSwitchRecovery: postSwitchAccuracy == null ? null : postSwitchAccuracy - accuracySwitch,
      accuracySwitch,
      accuracyRepeat,
      medianRtSwitch,
      medianRtRepeat,
      overallAccuracy,
      omissionRate,
      perseverativeErrorCount: perseverativeErrors,
    },
    qualityFlags: {
      interpretable: !insufficientSwitchTrials
        && !insufficientRepeatTrials
        && !lowAccuracy
        && !excessiveOmissions
        && !constantResponse,
      insufficientSwitchTrials,
      insufficientRepeatTrials,
      lowAccuracy,
      excessiveOmissions,
      constantResponse,
      interrupted,
    },
  }
}
