import { CognitiveScoreResult, ScoringTrial } from '../cognitive.types'
import { StroopConfig } from '../schemas/stroop.config'
import { StroopTrial } from '../schemas/stroop.trial'
import { scoreStroopV1 } from './stroop.v1'

/** 总体准确率低于该阈值则标记 lowAccuracy（scoringVersion 1.1.0 钉死）。 */
const LOW_ACCURACY = 0.5

/**
 * Stroop scoring 1.1.0：复用 v1.0.0 指标，补 lowAccuracy。
 * 不改变 stroopEffectMs / errorCost / Product Index 公式。
 */
export const scoreStroopV1_1 = (input: {
  config: StroopConfig
  trials: ScoringTrial<StroopTrial>[]
}): CognitiveScoreResult => {
  const base = scoreStroopV1(input)
  const accuracy = typeof base.metrics.accuracy === 'number' ? base.metrics.accuracy : 0
  const lowAccuracy = accuracy < LOW_ACCURACY

  return {
    ...base,
    qualityFlags: {
      ...base.qualityFlags,
      lowAccuracy,
    },
  }
}
