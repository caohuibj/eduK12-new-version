import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { PursuitrotorConfig } from '../schemas/pursuitrotor.config'
import { PursuitrotorTrial } from '../schemas/pursuitrotor.trial'

const round = (value: number): number => Number(value.toFixed(4))

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const LOW_TRACKING = 0.3

/** Pursuitrotor v1：追踪时间比由服务端换算；路径为冻结圆轨恒速。 */
export const scorePursuitrotorV1 = (input: {
  config: PursuitrotorConfig
  trials: ScoringTrial<PursuitrotorTrial>[]
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `pursuitrotor v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `pursuitrotor v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })

  let totalTimeOnTarget = 0
  let totalTrack = 0

  for (const trial of sorted) {
    if (trial.payload.interrupted) continue
    totalTimeOnTarget += trial.payload.timeOnTargetMs
    totalTrack += Math.min(trial.payload.totalTrackMs, config.trackMs)
  }

  const onTargetRate = totalTrack === 0 ? null : round(totalTimeOnTarget / totalTrack)

  return {
    score: onTargetRate === null ? 0 : Math.round(onTargetRate * 100),
    metrics: {
      onTargetRate,
      totalTimeOnTargetMs: totalTimeOnTarget,
      totalTrackMs: totalTrack,
    },
    qualityFlags: {
      interpretable: totalTrack > 0,
      noTracking: totalTrack === 0,
      lowTracking: (onTargetRate ?? 0) < LOW_TRACKING,
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
