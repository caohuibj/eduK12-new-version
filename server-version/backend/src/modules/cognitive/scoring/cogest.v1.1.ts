import { cogestConfigV11Schema } from '../tasks/cogest/config-v1.1'
import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { CogestConfig } from '../schemas/cogest.config'
import { cogestTrialSchema, CogestTrial } from '../schemas/cogest.trial'
import { COGEST_BANK, COGEST_STIMULUS_SET_VERSION } from '../tasks/cogest/bank-v1.1'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const LOW_ACCURACY = 0.5
const MIN_VALID_CORRECT_RT = 2

/** Cogest v1：正确性由冻结题库权威推导。 */
export const scoreCogestV11 = (input: {
  config: CogestConfig
  trials: ScoringTrial<CogestTrial>[]
}): CognitiveScoreResult => {
  const config = cogestConfigV11Schema.parse(input.config)
  if (config.stimulusSetVersion !== COGEST_STIMULUS_SET_VERSION) {
    throw new CognitiveScoringInputError(`cogest v1.1 only scores stimulus set ${COGEST_STIMULUS_SET_VERSION}`)
  }
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .map(trial => ({...trial,payload:cogestTrialSchema.parse(trial.payload)}))
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `cogest v1.1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `cogest v1.1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })
  if (sorted.some(trial => trial.payload.rtMs !== null && trial.payload.rtMs > config.timeoutMs)) throw new CognitiveScoringInputError('Late responses must be recorded as null timeouts')
  const itemIds = sorted.map((trial) => trial.payload.itemId)
  if (new Set(itemIds).size !== itemIds.length) {
    throw new CognitiveScoringInputError('cogest v1.1 requires distinct items within a submission')
  }

  const isCorrect = (trial: CogestTrial): boolean => {
    const item = COGEST_BANK.find((candidate) => candidate.id === trial.itemId)
    if (!item) throw new CognitiveScoringInputError(`cogest v1.1 item ${trial.itemId} is not in the frozen bank`)
    return trial.responseIndex !== null && trial.responseIndex === item.answer
  }

  const correctCount = sorted.filter((trial) => isCorrect(trial.payload)).length
  const accuracy = correctCount / sorted.length
  const validCorrectRts = sorted
    .filter((trial) => isCorrect(trial.payload) && !trial.payload.interrupted && trial.payload.rtMs !== null)
    .map((trial) => trial.payload.rtMs as number)
    .filter((rt) => rt >= config.validRtFloorMs && rt <= config.timeoutMs)
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
      interpretable: !sorted.some((trial) => trial.payload.interrupted),
      insufficientValidRt,
      lowAccuracy,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
