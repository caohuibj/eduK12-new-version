import { describe, expect, it } from 'vitest'
import { gonogoConfigSchema } from '../../modules/cognitive/schemas/gonogo.config'
import { cptConfigSchema } from '../../modules/cognitive/schemas/cpt.config'
import { scoreGonogoV1 } from '../../modules/cognitive/scoring/gonogo.v1'
import { scoreCptV1 } from '../../modules/cognitive/scoring/cpt.v1'
import { mergeProfileConfig } from '../../modules/cognitive/profile-freeze'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'

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
  const trial = (index: number, trialType: 'go' | 'nogo', responded: boolean, rtMs: number | null = responded ? 300 : null) => ({
    trialIndex: index,
    payload: { trialType, responded, rtMs, interrupted: false },
  })

  it('computes commissionRate and dPrime on a balanced short form', () => {
    const trials = [
      trial(0, 'go', true, 280),
      trial(1, 'go', true, 300),
      trial(2, 'go', true, 320),
      trial(3, 'go', true, 340),
      trial(4, 'go', true, 260),
      trial(5, 'go', true, 310),
      trial(6, 'nogo', false),
      trial(7, 'nogo', true, 220),
    ]
    const result = scoreGonogoV1({ config: gonogoConfig, trials })
    expect(result.metrics.commissionRate).toBe(0.5)
    expect(result.metrics.hitRate).toBe(1)
    expect(typeof result.metrics.dPrime).toBe('number')
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(getCognitiveRegistryEntry('gonogo', '1.0.0', '1.0.0')!.metricDefinitions.commissionRate).toBeDefined()
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
    const trials = Array.from({ length: 12 }, (_, index) => ({
      trialIndex: index,
      payload: {
        blockIndex: 0,
        stimulus: index % 4 === 0 ? 'X' : 'A',
        isTarget: index % 4 === 0,
        responded: index % 4 === 0 || index === 1,
        rtMs: index % 4 === 0 || index === 1 ? 280 : null,
        interrupted: false,
      },
    }))
    const result = scoreCptV1({ config: cptConfig, trials })
    expect(result.metrics.omissionRate).toBe(0)
    expect(result.metrics.commissionRate).toBeGreaterThan(0)
    expect(result.metrics.dPrime).toEqual(expect.any(Number))
    expect(result.metrics.rtICV === null || typeof result.metrics.rtICV === 'number').toBe(true)
    expect(result.qualityFlags.interpretable).toBe(true)
  })
})
