import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { taskswitchSequence } from '../randomization'
import { TaskswitchConfig } from '../schemas/taskswitch.config'
import { TaskswitchTrial } from '../schemas/taskswitch.trial'
import { median } from './signal-detection'

export const scoreTaskswitchV1 = (input: {
  config: TaskswitchConfig
  trials: ScoringTrial<TaskswitchTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  const { config, trials } = input
  if (!input.randomSeed) {
    throw new CognitiveScoringInputError('taskswitch v1 requires session randomSeed')
  }
  const expected = taskswitchSequence(
    input.randomSeed,
    config.totalTrials,
    config.blockCount,
    config.switchRatio,
    config.includePureBlocks,
  )
  const sorted = [...trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(`taskswitch v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`)
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(`taskswitch v1 requires contiguous trialIndex 0..${config.totalTrials - 1}`)
    }
    const want = expected[index]
    if (
      trial.payload.blockIndex !== want.blockIndex
      || trial.payload.taskRule !== want.taskRule
      || trial.payload.previousTaskRule !== want.previousTaskRule
      || trial.payload.switchType !== want.switchType
      || trial.payload.stimulus !== want.stimulus
    ) {
      throw new CognitiveScoringInputError(`taskswitch v1 trial ${index} does not match the frozen seed sequence`)
    }
  })

  const isCorrect = (index: number, trial: TaskswitchTrial) =>
    trial.response === expected[index].correctResponse && trial.rtMs != null && trial.rtMs >= config.validRtFloorMs

  const mixed = sorted.filter((trial) => !(config.includePureBlocks && trial.payload.blockIndex < 2))
  const switchTrials = mixed.filter((trial) => trial.payload.switchType === 'switch')
  const repeatTrials = mixed.filter((trial) => trial.payload.switchType === 'repeat')
  const switchCorrect = switchTrials.filter((trial) => isCorrect(trial.trialIndex, trial.payload))
  const repeatCorrect = repeatTrials.filter((trial) => isCorrect(trial.trialIndex, trial.payload))
  const accuracySwitch = switchTrials.length ? switchCorrect.length / switchTrials.length : 0
  const accuracyRepeat = repeatTrials.length ? repeatCorrect.length / repeatTrials.length : 0
  const medianRtSwitch = median(switchCorrect.map((trial) => trial.payload.rtMs as number))
  const medianRtRepeat = median(repeatCorrect.map((trial) => trial.payload.rtMs as number))
  const switchCostRtMs = medianRtSwitch != null && medianRtRepeat != null ? medianRtSwitch - medianRtRepeat : null
  const switchCostAccuracy = accuracyRepeat - accuracySwitch

  const pure = config.includePureBlocks
    ? sorted.filter((trial) => trial.payload.blockIndex < 2 && trial.payload.switchType !== 'start')
    : []
  const pureCorrect = pure.filter((trial) => isCorrect(trial.trialIndex, trial.payload))
  const mixedRepeatCorrect = mixed.filter((trial) => trial.payload.switchType === 'repeat' && isCorrect(trial.trialIndex, trial.payload))
  const mixingCost = config.includePureBlocks
    ? (() => {
      const mixedRt = median(mixedRepeatCorrect.map((trial) => trial.payload.rtMs as number))
      const pureRt = median(pureCorrect.map((trial) => trial.payload.rtMs as number))
      return mixedRt != null && pureRt != null ? mixedRt - pureRt : null
    })()
    : null

  const insufficientSwitchTrials = switchCorrect.length < 8
  const insufficientRepeatTrials = repeatCorrect.length < 8
  const lowAccuracy = (switchCorrect.length + repeatCorrect.length) / Math.max(1, switchTrials.length + repeatTrials.length) < 0.6
  const interrupted = sorted.some((trial) => trial.payload.interrupted)
  const costScore = switchCostRtMs == null ? 0 : Math.max(0, Math.min(400, switchCostRtMs))

  return {
    score: Math.max(0, Math.min(100, Math.round((1 - costScore / 400) * 50 + accuracySwitch * 50))),
    metrics: {
      switchCostRtMs,
      switchCostAccuracy,
      medianRtSwitch,
      medianRtRepeat,
      accuracySwitch,
      accuracyRepeat,
      mixingCost,
    },
    qualityFlags: {
      interpretable: !insufficientSwitchTrials && !insufficientRepeatTrials && !lowAccuracy,
      insufficientSwitchTrials,
      insufficientRepeatTrials,
      lowAccuracy,
      interrupted,
    },
  }
}
