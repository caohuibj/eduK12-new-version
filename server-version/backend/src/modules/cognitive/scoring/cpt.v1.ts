import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { CptConfig } from '../schemas/cpt.config'
import { CptTrial } from '../schemas/cpt.trial'
import { dPrime, mean, median, sd } from './signal-detection'
import { cptSequence } from '../randomization'

const slope = (points: Array<{ x: number; y: number }>): number | null => {
  if (points.length < 2) return null
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const xMean = mean(xs)
  const yMean = mean(ys)
  const denom = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0)
  if (denom === 0) return 0
  return ys.reduce((sum, y, index) => sum + (xs[index] - xMean) * (y - yMean), 0) / denom
}

export const scoreCptV1 = (input: {
  config: CptConfig
  trials: ScoringTrial<CptTrial>[]
  randomSeed?: string
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
  if (!input.randomSeed) {
    throw new CognitiveScoringInputError('cpt v1 requires session randomSeed')
  }
  const expected = cptSequence(input.randomSeed, config.totalTrials, config.targetRatio, config.blockCount)
  const expectedTargets = expected.filter((trial) => trial.isTarget).length
  sorted.forEach((trial, index) => {
    const want = expected[index]
    if (
      trial.payload.blockIndex !== want.blockIndex
      || trial.payload.isTarget !== want.isTarget
      || trial.payload.stimulus !== want.stimulus
    ) {
      throw new CognitiveScoringInputError(`cpt v1 trial ${index} does not match the frozen seed sequence`)
    }
    if (trial.payload.isTarget !== (trial.payload.stimulus === 'X')) {
      throw new CognitiveScoringInputError(`cpt v1 trial ${index} stimulus/isTarget mismatch`)
    }
  })
  const targets = sorted.filter((trial) => trial.payload.isTarget)
  const nontargets = sorted.filter((trial) => !trial.payload.isTarget)
  if (targets.length !== expectedTargets || nontargets.length === 0) {
    throw new CognitiveScoringInputError(`cpt v1 expects ${expectedTargets} targets`)
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
  const blockOmission: Array<{ x: number; y: number }> = []
  const blockRt: Array<{ x: number; y: number }> = []
  for (let block = 0; block < config.blockCount; block += 1) {
    const blockTrials = sorted.filter((trial) => trial.payload.blockIndex === block)
    const blockTargets = blockTrials.filter((trial) => trial.payload.isTarget)
    const blockHits = blockTargets.filter((trial) => trial.payload.responded && (trial.payload.rtMs ?? 0) >= config.validRtFloorMs)
    if (blockTargets.length > 0) {
      blockOmission.push({ x: block, y: 1 - blockHits.length / blockTargets.length })
    }
    const blockMedian = median(blockHits.map((trial) => trial.payload.rtMs as number))
    if (blockMedian != null) blockRt.push({ x: block, y: blockMedian })
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
