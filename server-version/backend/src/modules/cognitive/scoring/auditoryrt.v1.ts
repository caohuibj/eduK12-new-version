import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { AuditoryrtConfig } from '../schemas/auditoryrt.config'
import { AuditoryrtTrial } from '../schemas/auditoryrt.trial'
import { mean, median, sd } from './signal-detection'

const round = (value: number): number => Number(value.toFixed(4))

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const MIN_VALID_RT_MS = 150
const MAX_VALID_RT_MS = 1000
const SCORE_ANCHOR_BEST_MS = 220
const SCORE_ANCHOR_WORST_MS = 700
const HIGH_CV = 0.5
const EXCESSIVE_ANTICIPATION_RATE = 0.3
const MIN_VALID_RATE = 0.5

/** Auditoryrt v1：听觉简单反应时；RT 有效窗口与预期/漏失判定由服务端换算。 */
export const scoreAuditoryrtV1 = (input: {
  config: AuditoryrtConfig
  trials: ScoringTrial<AuditoryrtTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `auditoryrt v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `auditoryrt v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })

  const validRts: number[] = []
  let anticipationCount = 0
  let lapseCount = 0
  for (const trial of sorted) {
    const { rtMs } = trial.payload
    if (rtMs !== null && rtMs < MIN_VALID_RT_MS) anticipationCount += 1
    else if (rtMs === null || rtMs > MAX_VALID_RT_MS) lapseCount += 1
    else validRts.push(rtMs)
  }

  const medianRtMs = median(validRts)
  const meanRtMs = validRts.length > 0 ? Math.round(mean(validRts)) : null
  const rtSdMs = validRts.length > 1 ? round(sd(validRts)) : null
  const rtCv = meanRtMs !== null && rtSdMs !== null ? round(rtSdMs / meanRtMs) : null

  const minValidCount = Math.max(4, Math.ceil(config.totalTrials * MIN_VALID_RATE))
  const score = medianRtMs === null
    ? 0
    : Math.max(0, Math.min(100, Math.round(
        ((SCORE_ANCHOR_WORST_MS - medianRtMs) / (SCORE_ANCHOR_WORST_MS - SCORE_ANCHOR_BEST_MS)) * 100
      )))

  return {
    score,
    metrics: {
      medianRtMs,
      meanRtMs,
      rtSdMs,
      rtCv,
      validCount: validRts.length,
      anticipationCount,
      lapseCount,
    },
    qualityFlags: {
      interpretable: validRts.length >= minValidCount,
      insufficientValidTrials: validRts.length < minValidCount,
      excessiveAnticipations: anticipationCount / config.totalTrials >= EXCESSIVE_ANTICIPATION_RATE,
      highVariability: rtCv !== null && rtCv > HIGH_CV,
      audioEnvironmentUnverified: sorted.every((trial) => trial.payload.audioLatencyMs === null),
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
