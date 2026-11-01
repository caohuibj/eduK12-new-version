import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { WordmeaningConfig } from '../schemas/wordmeaning.config'
import { WordmeaningTrial } from '../schemas/wordmeaning.trial'
import { WORDMEANING_BANK_V11 as WORDMEANING_BANK, WORDMEANING_STIMULUS_SET_VERSION_V11 as WORDMEANING_STIMULUS_SET_VERSION } from '../tasks/wordmeaning/bank-v1.1'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const LOW_ACCURACY = 0.5
const MIN_VALID_CORRECT_RT = 2

/** Wordmeaning v1：正确性由冻结题库权威推导。 */
export const scoreWordmeaningV11 = (input: {
  config: WordmeaningConfig
  trials: ScoringTrial<WordmeaningTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  if (!Number.isInteger(config.totalTrials) || config.totalTrials < 1 || config.totalTrials > WORDMEANING_BANK.length) throw new CognitiveScoringInputError('Requested count exceeds reviewed bank')
  for (const { payload } of input.trials) {
    if ((payload.responseIndex === null) !== (payload.rtMs === null)
      || (payload.responseIndex !== null && (!Number.isInteger(payload.responseIndex) || payload.responseIndex < 0 || payload.responseIndex > 3))
      || (payload.rtMs !== null && (!Number.isFinite(payload.rtMs) || payload.rtMs < 0 || payload.rtMs > config.timeoutMs))) {
      throw new CognitiveScoringInputError('Response and elapsed time must describe a valid choice or a null timeout')
    }
  }
  if (config.stimulusSetVersion !== WORDMEANING_STIMULUS_SET_VERSION) {
    throw new CognitiveScoringInputError(`wordmeaning v1 only scores stimulus set ${WORDMEANING_STIMULUS_SET_VERSION}`)
  }
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `wordmeaning v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `wordmeaning v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })
  const itemIds = sorted.map((trial) => trial.payload.itemId)
  if (new Set(itemIds).size !== itemIds.length) {
    throw new CognitiveScoringInputError('wordmeaning v1 requires distinct items within a submission')
  }

  const isCorrect = (trial: WordmeaningTrial): boolean => {
    const item = WORDMEANING_BANK.find((candidate) => candidate.id === trial.itemId)
    if (!item) throw new CognitiveScoringInputError(`wordmeaning v1 item ${trial.itemId} is not in the frozen bank`)
    return trial.responseIndex !== null && trial.responseIndex === item.answer
  }

  const correctCount = sorted.filter((trial) => isCorrect(trial.payload)).length
  const accuracy = correctCount / sorted.length
  const validCorrectRts = sorted
    .filter((trial) => isCorrect(trial.payload) && trial.payload.rtMs !== null)
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
