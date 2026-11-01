import { describe, expect, it } from 'vitest'
import { numberlineConfigSchema } from '../../modules/cognitive/schemas/numberline.config'
import { numberlineTrialSchema } from '../../modules/cognitive/schemas/numberline.trial'

const config = {
  totalTrials: 20,
  lineMax: 100,
  maxResponseMs: 10000,
  validRtFloorMs: 300,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('numberline schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(numberlineConfigSchema.safeParse(config).success).toBe(true)
    expect(numberlineTrialSchema.safeParse({
      targetNumber: 37,
      responsePosition: 0.4,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects client-derived fields and out-of-range positions', () => {
    expect(numberlineTrialSchema.safeParse({
      targetNumber: 37,
      responsePosition: 0.4,
      rtMs: 312,
      interrupted: false,
      absError: 3,
    }).success).toBe(false)
    expect(numberlineTrialSchema.safeParse({
      targetNumber: 37,
      responsePosition: 1.2,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(false)
    expect(numberlineConfigSchema.safeParse({ ...config, lineMax: 5 }).success).toBe(false)
  })

  it('uses responsePosition/rt null together for timeout facts', () => {
    expect(numberlineTrialSchema.safeParse({
      targetNumber: 37,
      responsePosition: null,
      rtMs: null,
      interrupted: false,
    }).success).toBe(true)
    expect(numberlineTrialSchema.safeParse({
      targetNumber: 37,
      responsePosition: null,
      rtMs: 300,
      interrupted: false,
    }).success).toBe(false)
  })
})
