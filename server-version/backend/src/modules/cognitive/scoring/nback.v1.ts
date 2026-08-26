import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { nbackSequence } from '../randomization'
import { NbackConfig } from '../schemas/nback.config'
import { NbackTrial } from '../schemas/nback.trial'
import { dPrime, median } from './signal-detection'

const MIN_TARGETS = 4
const RELIABLE_DPRIME = 0.5

export const scoreNbackV1 = (input: {
  config: NbackConfig
  trials: ScoringTrial<NbackTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  const { config, trials } = input
  if (!input.randomSeed) {
    throw new CognitiveScoringInputError('nback v1 requires session randomSeed')
  }
  const expected = nbackSequence(
    input.randomSeed,
    config.nLevels,
    config.trialCountByN,
    config.blockCountByN,
    config.targetRatio,
  )
  const sorted = [...trials].sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== expected.length) {
    throw new CognitiveScoringInputError(`nback v1 expects exactly ${expected.length} trials, got ${sorted.length}`)
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(`nback v1 requires contiguous trialIndex 0..${expected.length - 1}`)
    }
    const want = expected[index]
    if (
      trial.payload.nLevel !== want.nLevel
      || trial.payload.blockIndex !== want.blockIndex
      || trial.payload.stimulus !== want.stimulus
      || trial.payload.target !== want.target
    ) {
      throw new CognitiveScoringInputError(`nback v1 trial ${index} does not match the frozen seed sequence`)
    }
  })

  const dPrimeByN: Record<string, number> = {}
  const hitRateByN: Record<string, number> = {}
  const falseAlarmRateByN: Record<string, number> = {}
  const medianRtByN: Record<string, number | null> = {}
  let insufficientTargetsByN = false
  let ceilingOrFloorByN = false
  let targetTotal = 0
  let omissionTotal = 0

  for (const nLevel of config.nLevels) {
    const levelTrials = sorted.filter((trial) => trial.payload.nLevel === nLevel)
    const targets = levelTrials.filter((trial) => trial.payload.target)
    const nontargets = levelTrials.filter((trial) => !trial.payload.target)
    const hits = targets.filter((trial) => trial.payload.responded && (trial.payload.rtMs ?? 0) >= config.validRtFloorMs)
    const falseAlarms = nontargets.filter((trial) => trial.payload.responded).length
    const hitRate = targets.length ? hits.length / targets.length : 0
    const falseAlarmRate = nontargets.length ? falseAlarms / nontargets.length : 0
    const key = String(nLevel)
    dPrimeByN[key] = Math.round(dPrime(hits.length, targets.length || 1, falseAlarms, nontargets.length || 1) * 1000) / 1000
    hitRateByN[key] = hitRate
    falseAlarmRateByN[key] = falseAlarmRate
    medianRtByN[key] = median(hits.map((trial) => trial.payload.rtMs as number))
    targetTotal += targets.length
    omissionTotal += targets.length - hits.length
    if (targets.length < MIN_TARGETS) insufficientTargetsByN = true
    if (hitRate >= 0.95 && falseAlarmRate <= 0.05) ceilingOrFloorByN = true
    if (hitRate <= 0.15) ceilingOrFloorByN = true
  }

  const reliable = config.nLevels.filter((nLevel) => {
    const key = String(nLevel)
    const levelTrials = sorted.filter((trial) => trial.payload.nLevel === nLevel)
    const targets = levelTrials.filter((trial) => trial.payload.target).length
    return targets >= MIN_TARGETS && dPrimeByN[key] >= RELIABLE_DPRIME && hitRateByN[key] >= 0.15
  })
  const maxReliableN = reliable.length ? Math.max(...reliable) : 0
  const minN = Math.min(...config.nLevels)
  const maxN = Math.max(...config.nLevels)
  const loadCostDPrime = config.nLevels.length >= 2
    ? Math.round((dPrimeByN[String(minN)] - dPrimeByN[String(maxN)]) * 1000) / 1000
    : null
  const excessiveOmissions = targetTotal > 0 && omissionTotal / targetTotal >= 0.4
  const interrupted = sorted.some((trial) => trial.payload.interrupted)
  const meanPrime = Object.values(dPrimeByN).reduce((sum, value) => sum + value, 0) / Math.max(1, Object.keys(dPrimeByN).length)

  return {
    score: Math.max(0, Math.min(100, Math.round((maxReliableN / maxN) * 50 + Math.max(0, Math.min(4, meanPrime)) / 4 * 50))),
    metrics: {
      dPrimeByN,
      maxReliableN,
      hitRateByN,
      falseAlarmRateByN,
      medianRtByN,
      loadCostDPrime,
    },
    qualityFlags: {
      interpretable: !insufficientTargetsByN && maxReliableN > 0,
      insufficientTargetsByN,
      ceilingOrFloorByN,
      excessiveOmissions,
      interrupted,
    },
  }
}
