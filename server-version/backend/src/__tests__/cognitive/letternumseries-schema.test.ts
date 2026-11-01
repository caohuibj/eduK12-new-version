import { describe, expect, it } from 'vitest'
import { letternumseriesConfigSchema } from '../../modules/cognitive/schemas/letternumseries.config'
import { letternumseriesTrialSchema } from '../../modules/cognitive/schemas/letternumseries.trial'

const config = {
  totalTrials: 10,
  lettersPerTrial: 4,
  digitsPerTrial: 3,
  stimulusMs: 700,
  isiMs: 300,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('letternumseries schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(letternumseriesConfigSchema.safeParse(config).success).toBe(true)
    expect(letternumseriesTrialSchema.safeParse({
      sequence: ['D', '6', 'K', '2', 'M', '9', 'T'],
      lettersResponse: ['D', 'K', 'M', 'T'],
      digitsResponse: ['2', '6', '9'],
      responseDurationMs: 4200,
      interrupted: false,
    }).success).toBe(true)
  })

  it('allows empty responses and rejects client-derived fields', () => {
    expect(letternumseriesTrialSchema.safeParse({
      sequence: ['D', '6', 'K'],
      lettersResponse: [],
      digitsResponse: [],
      responseDurationMs: 800,
      interrupted: false,
    }).success).toBe(true)
    expect(letternumseriesTrialSchema.safeParse({
      sequence: ['D', '6', 'K'],
      lettersResponse: [],
      digitsResponse: [],
      responseDurationMs: 800,
      interrupted: false,
      lettersAccuracy: 1,
    }).success).toBe(false)
  })
})
