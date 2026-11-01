import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { IcarmatrixConfig } from '../schemas/icarmatrix.config'
import { IcarmatrixTrial } from '../schemas/icarmatrix.trial'
import { ICARMATRIX_STIMULUS_SET_VERSION, icarmatrixItem } from '../tasks/icarmatrix/generator'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const LOW_ACCURACY = 0.5
const MIN_VALID_CORRECT_RT = 2

/** Icarmatrix v1：题目由服务端按 seed+index 重建，正确性由服务端推导。 */
export const scoreIcarmatrixV1 = (input: {
  config: IcarmatrixConfig
  trials: ScoringTrial<IcarmatrixTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  const { config } = input
  if (config.stimulusSetVersion !== ICARMATRIX_STIMULUS_SET_VERSION) {
    throw new CognitiveScoringInputError(`icarmatrix v1 only scores stimulus set ${ICARMATRIX_STIMULUS_SET_VERSION}`)
  }
  if (!input.randomSeed) throw new CognitiveScoringInputError('icarmatrix v1 requires randomSeed to regenerate items')
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `icarmatrix v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `icarmatrix v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
    if (trial.payload.itemIndex !== index) {
      throw new CognitiveScoringInputError(
        `icarmatrix v1 trial ${index} itemIndex ${trial.payload.itemIndex} does not match the presentation order`
      )
    }
  })

  const isCorrect = (trial: ScoringTrial<IcarmatrixTrial>): boolean => {
    const item = icarmatrixItem(input.randomSeed as string, trial.payload.itemIndex)
    return trial.payload.responseIndex !== null && trial.payload.responseIndex === item.answerIndex
  }

  const correctCount = sorted.filter((trial) => isCorrect(trial)).length
  const accuracy = correctCount / sorted.length
  const validCorrectRts = sorted
    .filter((trial) => isCorrect(trial) && trial.payload.rtMs !== null)
    .map((trial) => trial.payload.rtMs as number)
    .filter((rt) => rt >= config.validRtFloorMs)
  const medianRtMs = median(validCorrectRts)

  const insufficientValidRt = validCorrectRts.length < MIN_VALID_CORRECT_RT
  const lowAccuracy = accuracy < LOW_ACCURACY

  return {
    score: Math.round(accuracy * 100),
    metrics: {
      accuracy,
      medianRtMs,
      errorCount: sorted.length - correctCount - sorted.filter((trial) => trial.payload.responseIndex === null).length,
      timeoutCount: sorted.filter((trial) => trial.payload.responseIndex === null).length,
      validRtCount: validCorrectRts.length,
    },
    qualityFlags: {
      interpretable: !insufficientValidRt,
      insufficientValidRt,
      lowAccuracy,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
