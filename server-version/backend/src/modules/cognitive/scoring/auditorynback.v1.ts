import { CognitiveScoreResult, CognitiveScoringInputError, ScoringTrial } from '../cognitive.types'
import { AuditorynbackConfig } from '../schemas/auditorynback.config'
import { AuditorynbackTrial } from '../schemas/auditorynback.trial'
import { dPrime as hautusDPrime, median } from './signal-detection'
import { generateAuditoryNbackSequence } from '../tasks/auditorynback/generator'

const round = (value: number): number => Number(value.toFixed(4))

/** 以下阈值由 scoringVersion 1.0.0 钉死；调整需升 scoringVersion，不随 config 或报告文案变化。 */
const MIN_TARGETS = 6
const EXCESSIVE_OMISSION_RATE = 0.4
const SCORE_DPRIME_SPAN = 4

/** Auditorynback v1：纯音 n-back；音序列由服务端按 randomSeed 重建，命中/误报/d′ 服务端换算。 */
export const scoreAuditorynbackV1 = (input: {
  config: AuditorynbackConfig
  trials: ScoringTrial<AuditorynbackTrial>[]
  randomSeed?: string
}): CognitiveScoreResult => {
  const { config } = input
  const sorted = [...input.trials]
    .filter((trial) => trial.trialIndex >= 0 && trial.trialIndex < config.totalTrials)
    .sort((a, b) => a.trialIndex - b.trialIndex)
  if (sorted.length !== config.totalTrials) {
    throw new CognitiveScoringInputError(
      `auditorynback v1 expects exactly ${config.totalTrials} trials, got ${sorted.length}`
    )
  }
  sorted.forEach((trial, index) => {
    if (trial.trialIndex !== index) {
      throw new CognitiveScoringInputError(
        `auditorynback v1 requires contiguous trialIndex 0..${config.totalTrials - 1}; got ${trial.trialIndex} at position ${index}`
      )
    }
  })

  const nLevel = config.nLevel
  const sequence = generateAuditoryNbackSequence(
    input.randomSeed ?? '',
    config.totalTrials,
    nLevel,
    config.targetRatio,
    config.toneFrequenciesHz.length,
  )

  let hits = 0
  let misses = 0
  let falseAlarms = 0
  let matchCount = 0
  let nonmatchCount = 0
  let echoMismatch = false
  const hitRts: number[] = []
  for (const trial of sorted) {
    const { trialIndex } = trial
    const { toneIndex, responded, rtMs } = trial.payload
    if (toneIndex !== sequence[trialIndex]) echoMismatch = true
    if (trialIndex < nLevel) continue
    const isMatch = sequence[trialIndex] === sequence[trialIndex - nLevel]
    if (isMatch) {
      matchCount += 1
      if (responded) {
        hits += 1
        if (rtMs !== null) hitRts.push(rtMs)
      } else misses += 1
    } else {
      nonmatchCount += 1
      if (responded) falseAlarms += 1
    }
  }

  const dPrime = matchCount > 0 && nonmatchCount > 0
    ? round(hautusDPrime(hits, matchCount, falseAlarms, nonmatchCount))
    : null
  const hitRate = matchCount > 0 ? round(hits / matchCount) : null
  const falseAlarmRate = nonmatchCount > 0 ? round(falseAlarms / nonmatchCount) : null
  const medianHitRtMs = median(hitRts)
  const omissionRate = matchCount > 0 ? misses / matchCount : 0

  const score = dPrime === null
    ? 0
    : Math.max(0, Math.min(100, Math.round((Math.max(0, dPrime) / SCORE_DPRIME_SPAN) * 100)))

  return {
    score,
    metrics: {
      dPrime,
      hitRate,
      falseAlarmRate,
      medianHitRtMs,
      matchCount,
      nonmatchCount,
    },
    qualityFlags: {
      interpretable: matchCount >= MIN_TARGETS && nonmatchCount > 0 && dPrime !== null,
      insufficientTargets: matchCount < MIN_TARGETS || nonmatchCount === 0,
      excessiveOmissions: omissionRate >= EXCESSIVE_OMISSION_RATE,
      floorPerformance: dPrime !== null && dPrime < 0,
      ceilingPerformance: hitRate !== null && hitRate >= 0.98 && falseAlarmRate !== null && falseAlarmRate <= 0.02,
      stimulusEchoMismatch: echoMismatch,
      audioEnvironmentUnverified: sorted.every((trial) => trial.payload.audioLatencyMs === null),
      interrupted: sorted.some((trial) => trial.payload.interrupted),
    },
  }
}
