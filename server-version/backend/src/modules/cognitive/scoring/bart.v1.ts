import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { bartSequence } from '../randomization'
import { BartConfig } from '../schemas/bart.config'
import { BartTrial } from '../schemas/bart.trial'

const mean = (values: number[]): number | null => values.length === 0 ? null : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4))

export const scoreBartV1 = (input: {
  config: BartConfig
  trials: ScoringTrial<BartTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  if (!input.randomSeed) throw new CognitiveScoringInputError('bart v1 requires randomSeed')
  const expected = bartSequence(input.randomSeed, input.config.balloonCount, input.config.maxPumps)
  const trials = [...input.trials].sort((left, right) => left.trialIndex - right.trialIndex)
  if (trials.length !== expected.length) throw new CognitiveScoringInputError('bart v1 requires the configured balloon count')

  const cashoutPumps: number[] = []
  const completedPumps: number[] = []
  let explosionCount = 0
  let cashoutCount = 0
  let omissionCount = 0
  let interrupted = false

  trials.forEach((trial, index) => {
    if (trial.trialIndex !== index) throw new CognitiveScoringInputError('bart v1 requires contiguous trialIndex values')
    if (trial.payload.pumpCount > input.config.maxPumps) throw new CognitiveScoringInputError('bart v1 pumpCount exceeds configured maxPumps')
    const spec = expected[index]
    interrupted = interrupted || trial.payload.interrupted
    if (!trial.payload.completed) {
      omissionCount += 1
      return
    }
    const exploded = trial.payload.pumpCount >= spec.explosionThreshold
    if (trial.payload.cashedOut && exploded) throw new CognitiveScoringInputError(`bart v1 balloon ${index} cashout contradicts the frozen threshold`)
    if (!trial.payload.cashedOut && !exploded) throw new CognitiveScoringInputError(`bart v1 balloon ${index} explosion contradicts the frozen threshold`)
    completedPumps.push(trial.payload.pumpCount)
    if (trial.payload.cashedOut) {
      cashoutCount += 1
      cashoutPumps.push(trial.payload.pumpCount)
    } else {
      explosionCount += 1
    }
  })

  const omissionRate = omissionCount / expected.length
  const completedBalloonCount = completedPumps.length
  const cashoutRate = completedBalloonCount === 0 ? null : Number((cashoutCount / completedBalloonCount).toFixed(4))
  const insufficientCompletedBalloons = completedBalloonCount < Math.ceil(expected.length * 0.7)
  const insufficientCashoutBalloons = cashoutCount < 3
  const excessiveOmissions = omissionRate >= 0.3
  const constantPumpPattern = completedPumps.length >= 8 && new Set(completedPumps).size === 1

  return {
    // CognitiveScoreResult requires a numeric compatibility field. BART never
    // exposes this field as a product index or report metric.
    score: 0,
    metrics: {
      adjustedPumps: mean(cashoutPumps),
      explosionCount,
      cashoutCount,
      meanPumpsAllCompleted: mean(completedPumps),
      cashoutRate,
      completedBalloonCount,
      omissionRate: Number(omissionRate.toFixed(4)),
    },
    qualityFlags: {
      interpretable: !insufficientCompletedBalloons && !insufficientCashoutBalloons && !excessiveOmissions && !constantPumpPattern && !interrupted,
      insufficientCompletedBalloons,
      insufficientCashoutBalloons,
      excessiveOmissions,
      constantPumpPattern,
      invalidOutcome: false,
      interrupted,
    },
  }
}
