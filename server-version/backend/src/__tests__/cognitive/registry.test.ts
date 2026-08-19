import { describe, it, expect } from 'vitest'
import {
  getCognitiveRegistryEntry,
  hasCognitiveRegistryEntry,
  requireCognitiveRegistryEntry,
} from '../../modules/cognitive/cognitive.registry'
import { fakeConfigSchema } from '../../modules/cognitive/schemas/fake.config'
import { fakeTrialSchema } from '../../modules/cognitive/schemas/fake.trial'
import { scoreFakeV1 } from '../../modules/cognitive/scoring/fake.v1'

describe('cognitive registry', () => {
  it('looks up fake v1 entry with exact testType/engineVersion/scoringVersion', () => {
    expect(hasCognitiveRegistryEntry('fake', '1.0.0', '1.0.0')).toBe(true)
    const entry = getCognitiveRegistryEntry('fake', '1.0.0', '1.0.0')
    expect(entry).toBeDefined()
    expect(entry?.testType).toBe('fake')
    expect(entry?.engineVersion).toBe('1.0.0')
    expect(entry?.scoringVersion).toBe('1.0.0')
  })

  it('fails lookup for a wrong engineVersion', () => {
    expect(hasCognitiveRegistryEntry('fake', '2.0.0', '1.0.0')).toBe(false)
    expect(getCognitiveRegistryEntry('fake', '2.0.0', '1.0.0')).toBeUndefined()
  })

  it('fails lookup for a wrong scoringVersion', () => {
    expect(hasCognitiveRegistryEntry('fake', '1.0.0', '2.0.0')).toBe(false)
    expect(getCognitiveRegistryEntry('fake', '1.0.0', '2.0.0')).toBeUndefined()
  })

  it('fails lookup for an unknown testType', () => {
    expect(hasCognitiveRegistryEntry('reaction', '1.0.0', '1.0.0')).toBe(false)
    expect(getCognitiveRegistryEntry('reaction', '1.0.0', '1.0.0')).toBeUndefined()
  })

  it('never falls back to the latest version for a wrong scoringVersion', () => {
    // 错误版本必须明确失败，绝不回退到 fake/1.0.0/1.0.0
    expect(hasCognitiveRegistryEntry('fake', '1.0.0', '9.9.9')).toBe(false)
    expect(() =>
      requireCognitiveRegistryEntry('fake', '1.0.0', '9.9.9')
    ).toThrow(/No cognitive registry entry/)
  })

  it('entry references the fake config schema, trial schema and scorer', () => {
    const entry = getCognitiveRegistryEntry('fake', '1.0.0', '1.0.0')
    expect(entry?.configSchema).toBe(fakeConfigSchema)
    expect(entry?.trialSchema).toBe(fakeTrialSchema)
    expect(entry?.score).toBe(scoreFakeV1)
  })

  it('requireCognitiveRegistryEntry returns the entry for a valid key', () => {
    expect(requireCognitiveRegistryEntry('fake', '1.0.0', '1.0.0').testType).toBe('fake')
  })
})
