import { describe, expect, it } from 'vitest'
import { parseCognitiveConfig, validateCognitiveConfig } from '../../modules/cognitive/config/config-validator'

const reactionVersion = { testType: 'reaction', engineVersion: '1.0.0', scoringVersion: '1.0.0' }
const reactionConfig = {
  totalTrials: 20,
  foreperiodMinMs: 700,
  foreperiodMaxMs: 1500,
  timeoutMs: 2000,
  readyDurationMs: 1000,
  report: {
    reportVersion: '1.0.0',
    referenceMode: 'simulated',
    referenceVersion: 'sim-k12-v0.1',
    referenceBand: 'K7-9',
  },
}

describe('cognitive config validation', () => {
  it('uses the canonical schema for the exact version tuple', () => {
    expect(validateCognitiveConfig(reactionVersion, reactionConfig)).toEqual(reactionConfig)
    expect(parseCognitiveConfig(reactionVersion, reactionConfig).entry.testType).toBe('reaction')
  })

  it('rejects fields outside the frozen schema', () => {
    expect(() => validateCognitiveConfig(reactionVersion, { ...reactionConfig, validRtFloorMs: 100 })).toThrow()
  })

  it('does not fall back to an unknown implementation version', () => {
    expect(() => validateCognitiveConfig({ ...reactionVersion, scoringVersion: '9.9.9' }, reactionConfig))
      .toThrow(/No cognitive registry entry/)
  })
})
