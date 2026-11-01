import { CognitiveScoringInputError, type ScoringTrial } from '../cognitive.types'
import { numberlineNpConfigSchema, type NumberlineNpConfig } from '../schemas/numberline.np.config'
import type { NumberlineTrial } from '../schemas/numberline.trial'
import { buildNumberlineNpTargets } from '../tasks/numberline/np-generator'
import { scoreNumberlineV1 } from './numberline.v1'

export const scoreNumberlineNpV1 = (input: { config: NumberlineNpConfig; trials: ScoringTrial<NumberlineTrial>[]; randomSeed?: string }) => {
  const config = numberlineNpConfigSchema.parse(input.config)
  if (!input.randomSeed) throw new CognitiveScoringInputError('numberline NP requires frozen randomSeed')
  const targets = buildNumberlineNpTargets(input.randomSeed, config.lineMax, config.targetSet)
  const trials = [...input.trials].sort((a, b) => a.trialIndex - b.trialIndex)
  if (trials.length !== targets.length) throw new CognitiveScoringInputError('numberline NP requires exactly six trials')
  trials.forEach((trial, i) => {
    if (trial.trialIndex !== i || trial.payload.targetNumber !== targets[i].targetNumber) throw new CognitiveScoringInputError('numberline NP target/order differs from frozen set and seed')
    const p = trial.payload
    if ((p.responsePosition === null) !== (p.rtMs === null) || (p.rtMs !== null && p.rtMs > config.maxResponseMs)) throw new CognitiveScoringInputError('numberline NP response is outside frozen response window')
  })
  return scoreNumberlineV1({ config, trials })
}
