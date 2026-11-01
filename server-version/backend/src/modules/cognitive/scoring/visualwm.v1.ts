import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { VisualwmConfig } from '../schemas/visualwm.config'
import { VisualwmTrial } from '../schemas/visualwm.trial'
import { visualwmTrial } from '../tasks/visualwm/generator'

const round = (value: number): number => Number(value.toFixed(4))

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion。 */
const LOW_ACCURACY = 0.5

/** Visualwm v1：颜色/位置/是否变化由服务端重建，命中率/误报率/准确率由服务端推导。 */
export const scoreVisualwmV1 = (input: {
  config: VisualwmConfig
  trials: ScoringTrial<VisualwmTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  const { config } = input
  if (!input.randomSeed) throw new CognitiveScoringInputError('visualwm v1 requires randomSeed to regenerate stimuli')
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `visualwm v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `visualwm v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })

  let hitCount = 0 // said "change" when changed
  let hitTotal = 0
  let falseAlarmCount = 0 // said "change" when same
  let falseAlarmTotal = 0
  let correctCount = 0
  const validRts: number[] = []

  for (const trial of sorted) {
    const stimulus = visualwmTrial(input.randomSeed as string, trial.trialIndex)
    if (trial.payload.setSize !== stimulus.setSize || trial.payload.isChange !== stimulus.isChange) {
      throw new CognitiveScoringInputError(`visualwm v1 trial ${trial.trialIndex} stimulus does not match the frozen regeneration`)
    }
    if (trial.payload.interrupted || trial.payload.response === null) continue
    const saidChange = trial.payload.response === 'change'
    if (stimulus.isChange) {
      hitTotal += 1
      if (saidChange) hitCount += 1
    } else {
      falseAlarmTotal += 1
      if (saidChange) falseAlarmCount += 1
    }
    const correct = saidChange === stimulus.isChange
    if (correct) correctCount += 1
    if (trial.payload.rtMs !== null && trial.payload.rtMs >= config.validRtFloorMs) validRts.push(trial.payload.rtMs)
  }

  const accuracy = round(correctCount / sorted.length)
  const hitRate = hitTotal === 0 ? null : round(hitCount / hitTotal)
  const falseAlarmRate = falseAlarmTotal === 0 ? null : round(falseAlarmCount / falseAlarmTotal)
  const medianRt = validRts.length === 0 ? null : sorted.slice().sort()[0] === undefined ? null : ((): number | null => {
    const sortedRts = [...validRts].sort((a, b) => a - b)
    const mid = Math.floor(sortedRts.length / 2)
    return sortedRts.length % 2 === 1 ? sortedRts[mid] : (sortedRts[mid - 1] + sortedRts[mid]) / 2
  })()

  return {
    score: Math.round(accuracy * 100),
    metrics: {
      accuracy,
      hitRate,
      falseAlarmRate,
      medianRtMs: medianRt,
      correctCount,
    },
    qualityFlags: {
      interpretable: !insufficient(validRts.length),
      insufficientValidRt: insufficient(validRts.length),
      lowAccuracy: accuracy < LOW_ACCURACY,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}

function insufficient(count: number): boolean { return count < 2 }
