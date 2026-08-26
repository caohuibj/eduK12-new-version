import { describe, expect, it } from 'vitest'
import { nbackConfigSchema } from '../../modules/cognitive/schemas/nback.config'
import { corsiConfigSchema } from '../../modules/cognitive/schemas/corsi.config'
import { scoreNbackV1 } from '../../modules/cognitive/scoring/nback.v1'
import { scoreCorsiV1 } from '../../modules/cognitive/scoring/corsi.v1'
import { mergeProfileConfig } from '../../modules/cognitive/profile-freeze'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { corsiSequence, cptSequence, gonogoSequence, nbackSequence, RANDOMIZATION_ALGORITHM_VERSION } from '../../modules/cognitive/randomization'
import golden from '../../../../cognitive-randomization-golden-v1.json'

const nbackConfig = {
  nLevels: [1] as Array<1 | 2 | 3>,
  trialCountByN: [16],
  blockCountByN: [1],
  targetRatio: 0.3,
  stimulusMs: 400,
  isiMs: 800,
  validRtFloorMs: 100,
  report: { reportVersion: '1.0.0', referenceMode: 'none' as const },
}

const corsiConfig = {
  startSpan: 3,
  maxSpan: 4,
  trialsPerLevel: 2 as const,
  boardSize: 9 as const,
  highlightMs: 400,
  intervalMs: 200,
  readyDurationMs: 400,
  inactivityGuardMs: 8000,
  report: { reportVersion: '1.0.0', referenceMode: 'none' as const },
}

describe('nback schema and profiles', () => {
  it('locks 1-back / 1+2-back / 1+2+3-back trial contracts', () => {
    expect(nbackConfigSchema.safeParse(nbackConfig).success).toBe(true)
    expect(nbackConfigSchema.safeParse({ ...nbackConfig, nLevels: [1, 2], trialCountByN: [40, 60], blockCountByN: [1, 1] }).success).toBe(true)
    expect(nbackConfigSchema.safeParse({ ...nbackConfig, nLevels: [1, 2, 3], trialCountByN: [60, 60, 60], blockCountByN: [2, 2, 2] }).success).toBe(true)
    expect(nbackConfigSchema.safeParse({ ...nbackConfig, nLevels: [1, 1], trialCountByN: [30, 30], blockCountByN: [1, 1] }).success).toBe(false)
    const entry = getCognitiveRegistryEntry('nback', '1.0.0', '1.0.0')!
    expect(mergeProfileConfig(entry, nbackConfig, 'experience').nLevels).toEqual([1])
    expect(mergeProfileConfig(entry, nbackConfig, 'standard').trialCountByN).toEqual([40, 60])
    expect(mergeProfileConfig(entry, nbackConfig, 'research').nLevels).toEqual([1, 2, 3])
  })
})

describe('nback scorer', () => {
  const seed = 'seed-nback'
  const expected = nbackSequence(seed, nbackConfig.nLevels, nbackConfig.trialCountByN, nbackConfig.blockCountByN, nbackConfig.targetRatio)

  it('computes dPrimeByN and maxReliableN on the frozen seed sequence', () => {
    const trials = expected.map((item, index) => ({
      trialIndex: index,
      payload: {
        ...item,
        responded: item.target,
        rtMs: item.target ? 320 : null,
        interrupted: false,
      },
    }))
    const result = scoreNbackV1({ config: nbackConfig, trials, randomSeed: seed })
    expect(result.metrics.maxReliableN).toBe(1)
    expect(result.metrics.dPrimeByN).toEqual(expect.objectContaining({ '1': expect.any(Number) }))
    expect(result.qualityFlags.interpretable).toBe(true)
  })

  it('rejects a swapped target that keeps the same counts', () => {
    const firstTarget = expected.findIndex((item) => item.target)
    const firstNon = expected.findIndex((item) => !item.target && item.nLevel === 1)
    const trials = expected.map((item, index) => ({
      trialIndex: index,
      payload: {
        ...item,
        target: index === firstTarget ? false : index === firstNon ? true : item.target,
        responded: item.target,
        rtMs: item.target ? 320 : null,
        interrupted: false,
      },
    }))
    expect(() => scoreNbackV1({ config: nbackConfig, trials, randomSeed: seed })).toThrow(/frozen seed sequence/)
  })
})

describe('corsi schema, profiles and scorer', () => {
  it('locks span 3-6 / 3-8 / 3-9 contracts', () => {
    expect(corsiConfigSchema.safeParse(corsiConfig).success).toBe(true)
    const entry = getCognitiveRegistryEntry('corsi', '1.0.0', '1.0.0')!
    expect(mergeProfileConfig(entry, corsiConfig, 'experience').maxSpan).toBe(6)
    expect(mergeProfileConfig(entry, corsiConfig, 'standard').maxSpan).toBe(8)
    expect(mergeProfileConfig(entry, corsiConfig, 'research').maxSpan).toBe(9)
  })

  it('scores maxSpan from the adaptive path and rejects a mutated seed sequence', () => {
    const seed = 'seed-corsi'
    const t0 = corsiSequence(seed, 0, 3)
    const t1 = corsiSequence(seed, 1, 3)
    const t2 = corsiSequence(seed, 2, 4)
    const t3 = corsiSequence(seed, 3, 4)
    const trials = [
      { trialIndex: 0, payload: { spanLength: 3, trialWithinLevel: 1 as const, sequence: t0, response: t0, responseDurationMs: 900, interrupted: false } },
      { trialIndex: 1, payload: { spanLength: 3, trialWithinLevel: 2 as const, sequence: t1, response: t1, responseDurationMs: 800, interrupted: false } },
      { trialIndex: 2, payload: { spanLength: 4, trialWithinLevel: 1 as const, sequence: t2, response: t2.slice().reverse(), responseDurationMs: 1100, interrupted: false } },
      { trialIndex: 3, payload: { spanLength: 4, trialWithinLevel: 2 as const, sequence: t3, response: t3.slice().reverse(), responseDurationMs: 1000, interrupted: false } },
    ]
    const result = scoreCorsiV1({ config: corsiConfig, trials, randomSeed: seed })
    expect(result.metrics.maxSpan).toBe(3)
    expect(result.metrics.totalCorrectTrials).toBe(2)
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(() => scoreCorsiV1({
      config: corsiConfig,
      randomSeed: seed,
      trials: trials.map((trial, index) => index === 0
        ? { ...trial, payload: { ...trial.payload, sequence: [...trial.payload.sequence].reverse() } }
        : trial),
    })).toThrow(/frozen seed/)
  })
})

describe('nback/corsi randomization contract', () => {
  it('is deterministic per seed and versioned', () => {
    expect(RANDOMIZATION_ALGORITHM_VERSION).toBe('seq-v1.0.0')
    expect(nbackSequence('seed-1', [1], [16], [1], 0.3)).toEqual(nbackSequence('seed-1', [1], [16], [1], 0.3))
    expect(nbackSequence('seed-1', [1], [16], [1], 0.3)).not.toEqual(nbackSequence('seed-2', [1], [16], [1], 0.3))
    expect(corsiSequence('seed-1', 0, 3)).toEqual(corsiSequence('seed-1', 0, 3))
    expect(corsiSequence('seed-1', 0, 3)).not.toEqual(corsiSequence('seed-1', 1, 3))
    expect(new Set(corsiSequence('seed-1', 0, 4)).size).toBe(4)
  })

  it('restarts target eligibility inside every block and uses global block ids', () => {
    const sequence = nbackSequence('block-seed', [1, 2, 3], [60, 60, 60], [2, 2, 2], 0.3)
    expect([...new Set(sequence.map((trial) => trial.blockIndex))]).toEqual([0, 1, 2, 3, 4, 5])
    for (const blockIndex of [0, 1, 2, 3, 4, 5]) {
      const block = sequence.filter((trial) => trial.blockIndex === blockIndex)
      const nLevel = block[0].nLevel
      expect(block.slice(0, nLevel).every((trial) => trial.target === false)).toBe(true)
      block.forEach((trial, index) => {
        if (index < nLevel) return
        expect(trial.target).toBe(trial.stimulus === block[index - nLevel].stimulus)
      })
    }
  })

  it('matches the repository-wide golden vectors', () => {
    expect(RANDOMIZATION_ALGORITHM_VERSION).toBe(golden.version)
    expect(nbackSequence(golden.seed, [1, 2], [6, 8], [2, 2], 0.3)).toEqual(golden.nback)
    expect(corsiSequence(golden.seed, 3, 5)).toEqual(golden.corsi)
    expect(gonogoSequence(golden.seed, 8, 0.25)).toEqual(golden.gonogo)
    expect(cptSequence(golden.seed, 8, 0.25, 2)).toEqual(golden.cpt)
  })
})
