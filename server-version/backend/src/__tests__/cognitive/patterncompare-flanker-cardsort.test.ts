import { describe, expect, it } from 'vitest'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { mergeProfileConfig } from '../../modules/cognitive/profile-freeze'
import { patterncompareConfigSchema } from '../../modules/cognitive/schemas/patterncompare.config'
import { flankerConfigSchema } from '../../modules/cognitive/schemas/flanker.config'
import { cardsortConfigSchema } from '../../modules/cognitive/schemas/cardsort.config'
import { scorePatterncompareV1 } from '../../modules/cognitive/scoring/patterncompare.v1'
import { scoreFlankerV1 } from '../../modules/cognitive/scoring/flanker.v1'
import { scoreCardsortV1 } from '../../modules/cognitive/scoring/cardsort.v1'
import { cardsortSequence, flankerSequence, patterncompareTrial } from '../../modules/cognitive/randomization'
import golden from '../../../../cognitive-randomization-golden-v1.json'

const NONE_REPORT = { reportVersion: '1.0.0' as const, referenceMode: 'none' as const }
const patternConfig = { durationSec: 60, trialTimeoutMs: 2500, isiMs: 250, validRtFloorMs: 150, stimulusSetVersion: 'geometric-v1.0.0' as const, report: NONE_REPORT }
const flankerConfig = { totalTrials: 24, congruentRatio: 0.5 as const, stimulusMs: 1800, isiMs: 400, validRtFloorMs: 150, stimulusSetVersion: 'arrows-v1.0.0' as const, report: NONE_REPORT }
const cardsortConfig = { totalTrials: 24, switchRatio: 0.33, blockCount: 2, cueMs: 500, stimulusMs: 2000, isiMs: 350, validRtFloorMs: 150, stimulusSetVersion: 'geometric-cards-v1.0.0' as const, report: NONE_REPORT }

describe('Round 2 PR3 task contracts', () => {
  it('has strict schemas and three exact profile patches', () => {
    expect(patterncompareConfigSchema.safeParse(patternConfig).success).toBe(true)
    expect(patterncompareConfigSchema.safeParse({ ...patternConfig, unknown: true }).success).toBe(false)
    expect(flankerConfigSchema.safeParse({ ...flankerConfig, totalTrials: 26 }).success).toBe(false)
    expect(cardsortConfigSchema.safeParse({ ...cardsortConfig, blockCount: 5 }).success).toBe(false)

    const pattern = getCognitiveRegistryEntry('patterncompare', '1.0.0', '1.0.0')!
    expect(mergeProfileConfig(pattern, patternConfig, 'experience')).toMatchObject({ durationSec: 30 })
    expect(mergeProfileConfig(pattern, patternConfig, 'standard')).toMatchObject({ durationSec: 60 })
    expect(mergeProfileConfig(pattern, patternConfig, 'research')).toMatchObject({ durationSec: 90 })
    const flanker = getCognitiveRegistryEntry('flanker', '1.0.0', '1.0.0')!
    expect(mergeProfileConfig(flanker, flankerConfig, 'experience')).toMatchObject({ totalTrials: 24 })
    expect(mergeProfileConfig(flanker, flankerConfig, 'standard')).toMatchObject({ totalTrials: 80 })
    expect(mergeProfileConfig(flanker, flankerConfig, 'research')).toMatchObject({ totalTrials: 160 })
    const cardsort = getCognitiveRegistryEntry('cardsort', '1.0.0', '1.0.0')!
    expect(mergeProfileConfig(cardsort, cardsortConfig, 'experience')).toMatchObject({ totalTrials: 24, blockCount: 2 })
    expect(mergeProfileConfig(cardsort, cardsortConfig, 'standard')).toMatchObject({ totalTrials: 72, blockCount: 3 })
    expect(mergeProfileConfig(cardsort, cardsortConfig, 'research')).toMatchObject({ totalTrials: 144, blockCount: 6 })
  })

  it('scores pattern comparison from seed-replayed self-generated geometry', () => {
    const seed = 'pattern-seed'
    const config = { ...patternConfig, durationSec: 30 }
    const trials = Array.from({ length: 12 }, (_, trialIndex) => {
      const spec = patterncompareTrial(seed, trialIndex)
      return { trialIndex, payload: { leftPattern: spec.leftPattern, rightPattern: spec.rightPattern, response: spec.correctResponse, rtMs: 500 + trialIndex, interrupted: false, timedOut: false } }
    })
    const result = scorePatterncompareV1({ config, trials, randomSeed: seed })
    expect(result.metrics).toMatchObject({ correctPerMinute: 24, accuracy: 1, lapseRate: 0 })
    expect(result.qualityFlags.interpretable).toBe(true)

    const forged = structuredClone(trials)
    forged[0].payload.leftPattern.marks = forged[0].payload.leftPattern.marks === 3 ? 2 : 3
    expect(() => scorePatterncompareV1({ config, trials: forged, randomSeed: seed })).toThrow(/frozen seed sequence/)
  })

  it('keeps Flanker conditions and target directions exactly balanced', () => {
    const seed = 'flanker-seed'
    const expected = flankerSequence(seed, flankerConfig.totalTrials)
    expect(expected.filter((trial) => trial.targetDirection === trial.flankerDirection)).toHaveLength(12)
    expect(expected.filter((trial) => trial.targetDirection === 'left')).toHaveLength(12)
    const trials = expected.map((spec, trialIndex) => ({ trialIndex, payload: { targetDirection: spec.targetDirection, flankerDirection: spec.flankerDirection, response: spec.correctResponse, rtMs: spec.targetDirection === spec.flankerDirection ? 500 : 600, interrupted: false, timedOut: false } }))
    const result = scoreFlankerV1({ config: flankerConfig, trials, randomSeed: seed })
    expect(result.metrics).toMatchObject({ flankerEffectMs: 100, incongruentAccuracy: 1, congruentAccuracy: 1 })
    expect(result.qualityFlags.interpretable).toBe(true)
  })

  it('derives card-sort switches and perseveration from the frozen rule sequence', () => {
    const seed = 'cardsort-seed'
    const expected = cardsortSequence(seed, cardsortConfig.totalTrials, cardsortConfig.blockCount, cardsortConfig.switchRatio)
    const trials = expected.map((spec, trialIndex) => ({ trialIndex, payload: { ruleCue: spec.ruleCue, stimulusColor: spec.stimulusColor, stimulusShape: spec.stimulusShape, response: spec.switchType === 'switch' ? spec.previousRuleResponse : spec.correctResponse, rtMs: spec.switchType === 'switch' ? 700 : 500, interrupted: false, timedOut: false } }))
    const result = scoreCardsortV1({ config: cardsortConfig, trials, randomSeed: seed })
    expect(Number(result.metrics.perseverativeErrorRate)).toBeGreaterThan(0)
    expect(Number(result.metrics.accuracyRepeat)).toBe(1)

    const forged = structuredClone(trials)
    forged[0].payload.ruleCue = forged[0].payload.ruleCue === 'color' ? 'shape' : 'color'
    expect(() => scoreCardsortV1({ config: cardsortConfig, trials: forged, randomSeed: seed })).toThrow(/frozen seed sequence/)
  })

  it('marks insufficient or constant-response data as non-interpretable', () => {
    const patternSeed = 'pattern-quality'
    const shortPatternTrials = Array.from({ length: 4 }, (_, trialIndex) => {
      const spec = patterncompareTrial(patternSeed, trialIndex)
      return { trialIndex, payload: { leftPattern: spec.leftPattern, rightPattern: spec.rightPattern, response: spec.correctResponse, rtMs: 500, interrupted: false, timedOut: false } }
    })
    expect(scorePatterncompareV1({ config: { ...patternConfig, durationSec: 30 }, trials: shortPatternTrials, randomSeed: patternSeed }).qualityFlags).toMatchObject({ interpretable: false, insufficientCompletedTrials: true })

    const flankerSeed = 'flanker-quality'
    const constantTrials = flankerSequence(flankerSeed, 24).map((spec, trialIndex) => ({ trialIndex, payload: { targetDirection: spec.targetDirection, flankerDirection: spec.flankerDirection, response: 'left' as const, rtMs: 500, interrupted: false, timedOut: false } }))
    expect(scoreFlankerV1({ config: flankerConfig, trials: constantTrials, randomSeed: flankerSeed }).qualityFlags).toMatchObject({ interpretable: false, constantResponse: true })
  })

  it('is deterministic and changes with the seed', () => {
    expect(Array.from({ length: 4 }, (_, index) => patterncompareTrial(golden.seed, index))).toEqual(golden.patterncompare)
    expect(flankerSequence(golden.seed, 8)).toEqual(golden.flanker)
    expect(cardsortSequence(golden.seed, 12, 2, 0.33)).toEqual(golden.cardsort)
    expect(patterncompareTrial('seed-1', 0)).toEqual(patterncompareTrial('seed-1', 0))
    expect(patterncompareTrial('seed-1', 0)).not.toEqual(patterncompareTrial('seed-2', 0))
    expect(flankerSequence('seed-1', 24)).toEqual(flankerSequence('seed-1', 24))
    expect(flankerSequence('seed-1', 24)).not.toEqual(flankerSequence('seed-2', 24))
    expect(cardsortSequence('seed-1', 24, 2, 0.33)).toEqual(cardsortSequence('seed-1', 24, 2, 0.33))
    expect(cardsortSequence('seed-1', 24, 2, 0.33)).not.toEqual(cardsortSequence('seed-2', 24, 2, 0.33))
  })
})
