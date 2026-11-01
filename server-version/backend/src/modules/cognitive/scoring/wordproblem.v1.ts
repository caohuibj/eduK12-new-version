import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { WordproblemConfig } from '../schemas/wordproblem.config'
import { WordproblemTrial } from '../schemas/wordproblem.trial'
import { WORDPROBLEM_BANK, WORDPROBLEM_STIMULUS_SET_VERSION } from '../tasks/wordproblem/bank'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const LOW_ACCURACY = 0.5
const MIN_VALID_CORRECT_RT = 2

/** Wordproblem v1：正确性由冻结题库权威推导。 */
export const scoreWordproblemV1 = (input: {
  config: WordproblemConfig
  trials: ScoringTrial<WordproblemTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  if (config.stimulusSetVersion !== WORDPROBLEM_STIMULUS_SET_VERSION) {
    throw new CognitiveScoringInputError(`wordproblem v1 only scores stimulus set ${WORDPROBLEM_STIMULUS_SET_VERSION}`)
  }
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `wordproblem v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `wordproblem v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })
  const itemIds = sorted.map((trial) => trial.payload.itemId)
  if (new Set(itemIds).size !== itemIds.length) {
    throw new CognitiveScoringInputError('wordproblem v1 requires distinct items within a submission')
  }

  const isCorrect = (trial: WordproblemTrial): boolean => {
    const item = WORDPROBLEM_BANK.find((candidate) => candidate.id === trial.itemId)
    if (!item) throw new CognitiveScoringInputError(`wordproblem v1 item ${trial.itemId} is not in the frozen bank`)
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
