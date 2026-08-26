import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { GonogoConfig } from '../schemas/gonogo.config'
import { GonogoTrial } from '../schemas/gonogo.trial'
import { dPrime, median } from './signal-detection'
import { gonogoSequence } from '../randomization'

export const scoreGonogoV1 = (input: {
  config: GonogoConfig
  trials: ScoringTrial<GonogoTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  const { config, trials } = input
  const sorted = [...trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(`gonogo v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`)
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(`gonogo v1 requires contiguous trialIndex 0..${config.totalTrials - 1}`)
    }
  })
  const expectedNogo = Math.round(config.totalTrials * config.nogoRatio)
  const nogo = sorted.filter((trial) => trial.payload.trialType === 'nogo')
  const go = sorted.filter((trial) => trial.payload.trialType === 'go')
  if (!input.randomSeed) {
    throw new CognitiveScoringInputError('gonogo v1 requires session randomSeed')
  }
  const expected = gonogoSequence(input.randomSeed, config.totalTrials, config.nogoRatio)
  sorted.forEach((trial, index) => {
    if (trial.payload.trialType !== expected[index]) {
      throw new CognitiveScoringInputError(`gonogo v1 trial ${index} trialType does not match the frozen seed sequence`)
    }
  })
  if (nogo.length !== expectedNogo || go.length !== config.totalTrials - expectedNogo) {
    throw new CognitiveScoringInputError(`gonogo v1 expects ${expectedNogo} no-go trials`)
  }

  const hits = go.filter((trial) => trial.payload.responded && (trial.payload.rtMs ?? 0) >= config.validRtFloorMs).length
  const omissions = go.length - hits
  const commissions = nogo.filter((trial) => trial.payload.responded).length
  const hitRate = go.length ? hits / go.length : 0
  const omissionRate = go.length ? omissions / go.length : 0
  const commissionRate = nogo.length ? commissions / nogo.length : 0
  const goRts = go
    .map((trial) => trial.payload.rtMs)
    .filter((rt): rt is number => rt != null && rt >= config.validRtFloorMs)
  const insufficientNoGoTrials = nogo.length < Math.max(2, Math.round(config.totalTrials * config.nogoRatio * 0.5))
  const excessiveOmissions = omissionRate >= 0.3
  const extremeCommissionRate = commissionRate >= 0.5
  const interrupted = sorted.some((trial) => trial.payload.interrupted)
  const prime = dPrime(hits, go.length, commissions, nogo.length)

  return {
    score: Math.max(0, Math.min(100, Math.round((1 - commissionRate) * 50 + Math.max(0, Math.min(4, prime)) / 4 * 50))),
    metrics: {
      commissionRate,
      dPrime: Math.round(prime * 1000) / 1000,
      goMedianRtMs: median(goRts),
      hitRate,
      omissionRate,
      commissionErrors: commissions,
      goTrialCount: go.length,
      nogoTrialCount: nogo.length,
    },
    qualityFlags: {
      interpretable: !insufficientNoGoTrials && !excessiveOmissions,
      insufficientNoGoTrials,
      excessiveOmissions,
      extremeCommissionRate,
      interrupted,
    },
  }
}
