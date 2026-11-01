import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { SharegameConfig } from '../schemas/sharegame.config'
import { SharegameTrial } from '../schemas/sharegame.trial'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const round = (value: number): number => Number(value.toFixed(4))

/** Sharegame v1：给出比例、公平分割计数与一致性均由服务端推导；本任务为偏好描述，不设能力分数。 */
export const scoreSharegameV1 = (input: {
  config: SharegameConfig
  trials: ScoringTrial<SharegameTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.endowments.length)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.endowments.length) {
    throw new CognitiveScoringInputError(
      `sharegame v1 expects exactly ${config.endowments.length} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `sharegame v1 requires contiguous trialIndex 0..${config.endowments.length - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
    if (trial.payload.endowment !== config.endowments[index]) {
      throw new CognitiveScoringInputError(`sharegame v1 trial ${index} endowment does not match the frozen config`)
    }
    if (trial.payload.given > trial.payload.endowment) {
      throw new CognitiveScoringInputError(`sharegame v1 trial ${index} given exceeds the endowment`)
    }
  })

  const totalEndowment = sorted.reduce((sum, trial) => sum + trial.payload.endowment, 0)
  const totalGiven = sorted.reduce((sum, trial) => sum + trial.payload.given, 0)
  const givingRate = round(totalGiven / totalEndowment)
  const equalSplitCount = sorted.filter((trial) => trial.payload.given * 2 === trial.payload.endowment).length
  const generousRate = round(sorted.filter((trial) => trial.payload.given * 2 >= trial.payload.endowment).length / sorted.length)
  const perRoundRates = sorted.map((trial) => trial.payload.given / trial.payload.endowment)
  const meanRate = perRoundRates.reduce((sum, rate) => sum + rate, 0) / perRoundRates.length
  const givingRateSd = perRoundRates.length < 2 ? 0 : round(Math.sqrt(perRoundRates.reduce((sum, rate) => sum + (rate - meanRate) ** 2, 0) / perRoundRates.length))
  const medianDecisionMs = median(sorted.map((trial) => trial.payload.rtMs).filter((rt): rt is number => rt !== null))

  return {
    score: Math.round(givingRate * 100),
    showProductIndex: false,
    metrics: {
      givingRate,
      equalSplitCount,
      generousRate,
      givingRateSd,
      medianDecisionMs,
    },
    qualityFlags: {
      interpretable: true,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
