import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { TrustgameConfig } from '../schemas/trustgame.config'
import { TrustgameTrial } from '../schemas/trustgame.trial'

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const round = (value: number): number => Number(value.toFixed(4))

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const UNFAIR_THRESHOLD = 0.5 // 分给自己 < 总额一半 = 不公平提议

/** Trustgame v1：公平/不公平划分、接受率与拒绝数由服务端推导（响应者视角）。 */
export const scoreTrustgameV1 = (input: {
  config: TrustgameConfig
  trials: ScoringTrial<TrustgameTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.offers.length)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.offers.length) {
    throw new CognitiveScoringInputError(
      `trustgame v1 expects exactly ${config.offers.length} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `trustgame v1 requires contiguous trialIndex 0..${config.offers.length - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
    if (trial.payload.offerToSelf !== config.offers[index]) {
      throw new CognitiveScoringInputError(`trustgame v1 trial ${index} offer does not match the frozen schedule`)
    }
  })

  const isFair = (trial: ScoringTrial<TrustgameTrial>): boolean => trial.payload.offerToSelf * 2 >= config.potTotal
  const isAccept = (trial: ScoringTrial<TrustgameTrial>): boolean => trial.payload.response === 'accept'

  const responded = sorted.filter((trial) => trial.payload.response !== null)
  const fairOffers = sorted.filter((trial) => isFair(trial))
  const unfairOffers = sorted.filter((trial) => !isFair(trial))
  const acceptanceRate = responded.length === 0 ? null : round(responded.filter((trial) => isAccept(trial)).length / responded.length)
  const unfairAcceptanceRate = unfairOffers.length === 0 ? null : round(unfairOffers.filter((trial) => isAccept(trial)).length / unfairOffers.length)
  const rejectedUnfairCount = unfairOffers.filter((trial) => trial.payload.response === 'reject').length
  const medianDecisionMs = median(responded.map((trial) => trial.payload.rtMs).filter((rt): rt is number => rt !== null))

  return {
    score: acceptanceRate === null ? 0 : Math.round(acceptanceRate * 100),
    showProductIndex: false,
    metrics: {
      acceptanceRate,
      unfairAcceptanceRate,
      rejectedUnfairCount,
      fairOfferCount: fairOffers.length,
      medianDecisionMs,
    },
    qualityFlags: {
      interpretable: responded.length > 0,
      noResponses: responded.length === 0,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
