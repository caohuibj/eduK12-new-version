import { describe, expect, it } from 'vitest'
import { timecopyConfigSchema } from '../../modules/cognitive/schemas/timecopy.config'
import { timecopyTrialSchema } from '../../modules/cognitive/schemas/timecopy.trial'

const config = {
  totalTrials: 10,
  targetMinMs: 1000,
  targetMaxMs: 3000,
  maxResponseMs: 10000,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('timecopy schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(timecopyConfigSchema.safeParse(config).success).toBe(true)
    expect(timecopyTrialSchema.safeParse({
      targetMs: 1500,
      responseMs: 1620,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects inverted ranges and client-derived fields', () => {
    expect(timecopyConfigSchema.safeParse({ ...config, targetMaxMs: 900 }).success).toBe(false)
    expect(timecopyConfigSchema.safeParse({ ...config, maxResponseMs: 2500 }).success).toBe(false)
    expect(timecopyTrialSchema.safeParse({
      targetMs: 1500,
      responseMs: 1620,
      interrupted: false,
      absErrorRatio: 0.08,
    }).success).toBe(false)
  })

  it('requires integer nonnegative responses', () => {
    expect(timecopyTrialSchema.safeParse({
      targetMs: 1500,
      responseMs: 0,
      interrupted: false,
    }).success).toBe(true)
    expect(timecopyTrialSchema.safeParse({
      targetMs: 1500,
      responseMs: -5,
      interrupted: false,
    }).success).toBe(false)
  })
})
