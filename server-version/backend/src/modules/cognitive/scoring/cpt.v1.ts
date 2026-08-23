import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { CptConfig } from '../schemas/cpt.config'
import { CptTrial } from '../schemas/cpt.trial'
import { dPrime, mean, median, sd } from './signal-detection'

const slope = (values: number[]): number | null => {
  if (values.length < 2) return null
  const xs = values.map((_, index) => index)
  const xMean = mean(xs)
  const yMean = mean(values)
  const denom = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0)
  if (denom === 0) return 0
  return values.reduce((sum, y, index) => sum + (xs[index] - xMean) * (y - yMean), 0) / denom
}

export const scoreCptV1 = (input: {
  config: CptConfig
  trials: ScoringTrial<CptTrial>[]
}): CognitiveScoreResult => {
  const { config, trials } = input
  const sorted = [...trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(`cpt v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`)
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(`cpt v1 requires contiguous trialIndex 0..${config.totalTrials - 1}`)
    }
  })
  const perBlock = config.totalTrials / config.blockCount
  sorted.forEach((trial) => {
    if (trial.payload.blockIndex !== Math.floor(trial.trialIndex / perBlock)) {
      throw new CognitiveScoringInputError(`cpt v1 trial ${trial.trialIndex} has an inconsistent blockIndex`)
    }
  })

  const targets = sorted.filter((trial) => trial.payload.isTarget)
  const nontargets = sorted.filter((trial) => !trial.payload.isTarget)
  if (targets.length === 0 || nontargets.length === 0) {
    throw new CognitiveScoringInputError('cpt v1 requires both targets and non-targets')
  }
  const hits = targets.filter((trial) => trial.payload.responded && (trial.payload.rtMs ?? 0) >= config.validRtFloorMs)
  const omissions = targets.length - hits.length
  const commissions = nontargets.filter((trial) => trial.payload.responded).length
  const hitRts = hits.map((trial) => trial.payload.rtMs as number)
  const omissionRate = omissions / targets.length
  const commissionRate = commissions / nontargets.length
  const hitMean = mean(hitRts)
  const hitSd = sd(hitRts)
  const rtICV = hitMean > 0 ? hitSd / hitMean : null
  const perseverations = sorted.filter((trial) => trial.payload.rtMs != null && trial.payload.rtMs < config.perseverationRtMs).length
  const perseverationRate = perseverations / sorted.length
  const blockOmission: number[] = []
  const blockRt: number[] = []
  for (let block = 0; block < config.blockCount; block += 1) {
    const blockTrials = sorted.filter((trial) => trial.payload.blockIndex === block)
    const blockTargets = blockTrials.filter((trial) => trial.payload.isTarget)
    const blockHits = blockTargets.filter((trial) => trial.payload.responded && (trial.payload.rtMs ?? 0) >= config.validRtFloorMs)
    blockOmission.push(blockTargets.length ? 1 - blockHits.length / blockTargets.length : 0)
    blockRt.push(median(blockHits.map((trial) => trial.payload.rtMs as number)) ?? 0)
  }
  const insufficientTargets = targets.length < 3
  const highOmissionRate = omissionRate >= 0.4
  const highPerseverationRate = perseverationRate >= 0.1
  const interrupted = sorted.some((trial) => trial.payload.interrupted)
  const prime = dPrime(hits.length, targets.length, commissions, nontargets.length)

  return {
    score: Math.max(0, Math.min(100, Math.round((1 - omissionRate) * 40 + (1 - commissionRate) * 30 + Math.max(0, Math.min(4, prime)) / 4 * 30))),
    metrics: {
      dPrime: Math.round(prime * 1000) / 1000,
      omissionRate,
      commissionRate,
      rtICV,
      hitMedianRtMs: median(hitRts),
      hitRtSdMs: hitRts.length ? Math.round(hitSd * 1000) / 1000 : null,
      blockSlopeRt: slope(blockRt),
      blockSlopeOmission: slope(blockOmission),
      perseverationRate,
      targetCount: targets.length,
      hitCount: hits.length,
    },
    qualityFlags: {
      interpretable: !insufficientTargets && !highOmissionRate,
      insufficientTargets,
      highOmissionRate,
      highPerseverationRate,
      interrupted,
    },
  }
}
