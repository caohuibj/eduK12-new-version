import { describe, expect, it } from 'vitest'
import { semanticfluencyConfigSchema } from '../../modules/cognitive/schemas/semanticfluency.config'
import { semanticfluencyTrialSchema } from '../../modules/cognitive/schemas/semanticfluency.trial'

const config = {
  totalTrials: 4,
  durationMs: 45000,
  stimulusSetVersion: 'semanticfluency-zh-v1.0.0',
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('semanticfluency schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(semanticfluencyConfigSchema.safeParse(config).success).toBe(true)
    expect(semanticfluencyTrialSchema.safeParse({
      category: 'animals',
      responses: ['猫', '狗', '猫'],
      responseDurationMs: 45000,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects unknown categories and client-derived fields', () => {
    expect(semanticfluencyTrialSchema.safeParse({
      category: 'plants',
      responses: [],
      responseDurationMs: 1000,
      interrupted: false,
    }).success).toBe(false)
    expect(semanticfluencyTrialSchema.safeParse({
      category: 'animals',
      responses: ['猫'],
      responseDurationMs: 1000,
      interrupted: false,
      uniqueValidCount: 1,
    }).success).toBe(false)
  })
})
