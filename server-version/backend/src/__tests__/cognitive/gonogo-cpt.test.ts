import { describe, expect, it } from 'vitest'
import { gonogoConfigSchema } from '../../modules/cognitive/schemas/gonogo.config'
import { cptConfigSchema } from '../../modules/cognitive/schemas/cpt.config'
import { scoreGonogoV1 } from '../../modules/cognitive/scoring/gonogo.v1'
import { scoreCptV1 } from '../../modules/cognitive/scoring/cpt.v1'
import { mergeProfileConfig } from '../../modules/cognitive/profile-freeze'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { cptSequence, gonogoSequence, RANDOMIZATION_ALGORITHM_VERSION } from '../../modules/cognitive/randomization'

const gonogoConfig = {
  totalTrials: 8,
  nogoRatio: 0.25 as const,
  stimulusMs: 800,
  isiMs: 400,
  validRtFloorMs: 100,
  report: { reportVersion: '1.0.0', referenceMode: 'none' as const },
}

const cptConfig = {
  totalTrials: 12,
  targetRatio: 0.25,
  blockCount: 1,
  stimulusMs: 400,
  isiMs: 400,
  validRtFloorMs: 100,
  perseverationRtMs: 100 as const,
  report: { reportVersion: '1.0.0', referenceMode: 'none' as const },
}

describe('gonogo schema and profiles', () => {
  it('accepts experience/standard/research trial counts and rejects a bad ratio', () => {
    expect(gonogoConfigSchema.safeParse({ ...gonogoConfig, totalTrials: 40 }).success).toBe(true)
    expect(gonogoConfigSchema.safeParse({ ...gonogoConfig, totalTrials: 120 }).success).toBe(true)
    expect(gonogoConfigSchema.safeParse({ ...gonogoConfig, totalTrials: 240 }).success).toBe(true)
    expect(gonogoConfigSchema.safeParse({ ...gonogoConfig, nogoRatio: 0.5 }).success).toBe(false)
    const entry = getCognitiveRegistryEntry('gonogo', '1.0.0', '1.0.0')!
    expect(mergeProfileConfig(entry, gonogoConfig, 'experience').totalTrials).toBe(40)
    expect(mergeProfileConfig(entry, { ...gonogoConfig, totalTrials: 120 }, 'standard').totalTrials).toBe(120)
    expect(mergeProfileConfig(entry, { ...gonogoConfig, totalTrials: 240 }, 'research').totalTrials).toBe(240)
  })
})

describe('gonogo scorer', () => {
  const seed = 'seed-gonogo'
  const sequence = gonogoSequence(seed, 8, 0.25)
  const trialsFor = (mutate?: (index: number, type: 'go' | 'nogo') => { trialType: 'go' | 'nogo'; responded: boolean; rtMs: number | null }) =>
    sequence.map((trialType, index) => {
      const next = mutate?.(index, trialType) ?? {
        trialType,
        responded: trialType === 'go',
        rtMs: trialType === 'go' ? 300 : null,
      }
      return { trialIndex: index, payload: { ...next, interrupted: false } }
    })

  it('computes commissionRate and dPrime on the frozen seed sequence', () => {
    const result = scoreGonogoV1({ config: gonogoConfig, trials: trialsFor(), randomSeed: seed })
    expect(result.metrics.nogoTrialCount).toBe(2)
    expect(typeof result.metrics.dPrime).toBe('number')
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(getCognitiveRegistryEntry('gonogo', '1.0.0', '1.0.0')!.metricDefinitions.commissionRate).toBeDefined()
  })

  it('rejects a swapped trialType that still keeps 25% no-go', () => {
    const swapped = trialsFor((index, trialType) => {
      const flipped = sequence.findIndex((value, other) => other !== index && value !== trialType)
      if (index === 0 || index === flipped) {
        return { trialType: trialType === 'go' ? 'nogo' : 'go', responded: false, rtMs: null }
      }
      return { trialType, responded: trialType === 'go', rtMs: trialType === 'go' ? 300 : null }
    })
    expect(() => scoreGonogoV1({ config: gonogoConfig, trials: swapped, randomSeed: seed })).toThrow(/frozen seed sequence/)
  })
})

describe('cpt schema, profiles and scorer', () => {
  it('locks 60/180/360 trial contracts', () => {
    expect(cptConfigSchema.safeParse({ ...cptConfig, totalTrials: 60, blockCount: 1 }).success).toBe(true)
    expect(cptConfigSchema.safeParse({ ...cptConfig, totalTrials: 180, blockCount: 3 }).success).toBe(true)
    expect(cptConfigSchema.safeParse({ ...cptConfig, totalTrials: 360, blockCount: 6 }).success).toBe(true)
    expect(cptConfigSchema.safeParse({ ...cptConfig, totalTrials: 180, blockCount: 7 }).success).toBe(false)
    const entry = getCognitiveRegistryEntry('cpt', '1.0.0', '1.0.0')!
    expect(mergeProfileConfig(entry, { ...cptConfig, totalTrials: 180, blockCount: 3 }, 'experience').totalTrials).toBe(60)
    expect(mergeProfileConfig(entry, { ...cptConfig, totalTrials: 180, blockCount: 3 }, 'research').totalTrials).toBe(360)
  })

  it('reports dPrime, omission, commission and rtICV together', () => {
    const seed = 'seed-cpt'
    const expected = cptSequence(seed, 12, 0.25, 1)
    const trials = expected.map((item, index) => ({
      trialIndex: index,
      payload: {
        ...item,
        responded: item.isTarget,
        rtMs: item.isTarget ? 280 : null,
        interrupted: false,
      },
    }))
    const result = scoreCptV1({ config: cptConfig, trials, randomSeed: seed })
    expect(result.metrics.omissionRate).toBe(0)
    expect(result.metrics.dPrime).toEqual(expect.any(Number))
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(() => scoreCptV1({
      config: cptConfig,
      randomSeed: seed,
      trials: trials.map((trial, index) => index === 0
        ? { ...trial, payload: { ...trial.payload, isTarget: !trial.payload.isTarget } }
        : trial),
    })).toThrow(/frozen seed sequence/)
  })

  it('keeps missing block RT out of slope instead of writing 0ms', () => {
    const seed = 'seed-cpt-blocks'
    const config = { ...cptConfig, totalTrials: 12, blockCount: 3, targetRatio: 0.5 }
    const expected = cptSequence(seed, 12, 0.5, 3)
    const trials = expected.map((item, index) => {
      const skipHits = item.blockIndex === 1 && item.isTarget
      return {
        trialIndex: index,
        payload: {
          ...item,
          responded: item.isTarget && !skipHits,
          rtMs: item.isTarget && !skipHits ? 250 + item.blockIndex * 40 : null,
          interrupted: false,
        },
      }
    })
    const result = scoreCptV1({ config, trials, randomSeed: seed })
    expect(result.metrics.blockSlopeRt).toBe(40)
    expect(result.metrics.blockSlopeRt).not.toBe(0)

    const oneBlockHits = expected.map((item, index) => ({
      trialIndex: index,
      payload: {
        ...item,
        responded: item.blockIndex === 0 && item.isTarget,
        rtMs: item.blockIndex === 0 && item.isTarget ? 250 : null,
        interrupted: false,
      },
    }))
    const sparse = scoreCptV1({ config, trials: oneBlockHits, randomSeed: seed })
    expect(sparse.metrics.blockSlopeRt).toBeNull()
  })

  it('rejects a stimulus that contradicts isTarget', () => {
    const seed = 'seed-cpt'
    const expected = cptSequence(seed, 12, 0.25, 1)
    const trials = expected.map((item, index) => ({
      trialIndex: index,
      payload: {
        ...item,
        stimulus: index === 0 ? (item.isTarget ? 'A' : 'X') : item.stimulus,
        responded: item.isTarget,
        rtMs: item.isTarget ? 280 : null,
        interrupted: false,
      },
    }))
    expect(() => scoreCptV1({ config: cptConfig, trials, randomSeed: seed })).toThrow(/mismatch|frozen seed sequence/)
  })
})

describe('randomization contract', () => {
  it('is deterministic per seed and versioned', () => {
    expect(RANDOMIZATION_ALGORITHM_VERSION).toBe('seq-v1.0.0')
    expect(gonogoSequence('seed-1', 8, 0.25)).toEqual(['nogo', 'nogo', 'go', 'go', 'go', 'go', 'go', 'go'])
    expect(gonogoSequence('seed-1', 8, 0.25)).toEqual(gonogoSequence('seed-1', 8, 0.25))
    expect(gonogoSequence('seed-1', 8, 0.25)).not.toEqual(gonogoSequence('seed-2', 8, 0.25))
    expect(cptSequence('seed-1', 12, 0.25, 1)).toEqual([
      { blockIndex: 0, isTarget: true, stimulus: 'X' },
      { blockIndex: 0, isTarget: false, stimulus: 'B' },
      { blockIndex: 0, isTarget: true, stimulus: 'X' },
      { blockIndex: 0, isTarget: false, stimulus: 'N' },
      { blockIndex: 0, isTarget: false, stimulus: 'A' },
      { blockIndex: 0, isTarget: false, stimulus: 'D' },
      { blockIndex: 0, isTarget: false, stimulus: 'U' },
      { blockIndex: 0, isTarget: false, stimulus: 'N' },
      { blockIndex: 0, isTarget: false, stimulus: 'B' },
      { blockIndex: 0, isTarget: true, stimulus: 'X' },
      { blockIndex: 0, isTarget: false, stimulus: 'N' },
      { blockIndex: 0, isTarget: false, stimulus: 'N' },
    ])
    expect(cptSequence('seed-1', 12, 0.25, 1).every((trial) => trial.isTarget === (trial.stimulus === 'X'))).toBe(true)
  })
})
