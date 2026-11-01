import { describe, expect, it } from 'vitest'
import { delaydiscountConfigSchema } from '../../modules/cognitive/schemas/delaydiscount.config'
import { delaydiscountTrialSchema } from '../../modules/cognitive/schemas/delaydiscount.trial'

const config = {
  delayBands: [7, 30, 90],
  delayedAmount: 100,
  bisectionSteps: 5,
  fixationMs: 500,
  timeoutMs: 15000,
  validRtFloorMs: 300,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('delaydiscount schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(delaydiscountConfigSchema.safeParse(config).success).toBe(true)
    expect(delaydiscountTrialSchema.safeParse({
      delayDays: 30,
      delayedAmount: 100,
      immediateAmount: 50,
      choice: 'later',
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects duplicate delay bands and client-derived fields', () => {
    expect(delaydiscountConfigSchema.safeParse({ ...config, delayBands: [30, 30, 90] }).success).toBe(false)
    expect(delaydiscountConfigSchema.safeParse({ ...config, delayBands: [] }).success).toBe(false)
    expect(delaydiscountTrialSchema.safeParse({
      delayDays: 30,
      delayedAmount: 100,
      immediateAmount: 50,
      choice: 'later',
      rtMs: 312,
      interrupted: false,
      indifferenceRate: 0.5,
    }).success).toBe(false)
  })

  it('uses choice/rt null together for timeout facts', () => {
    expect(delaydiscountTrialSchema.safeParse({
      delayDays: 30,
      delayedAmount: 100,
      immediateAmount: 50,
      choice: null,
      rtMs: null,
      interrupted: false,
    }).success).toBe(true)
    expect(delaydiscountTrialSchema.safeParse({
      delayDays: 30,
      delayedAmount: 100,
      immediateAmount: 50,
      choice: null,
      rtMs: 300,
      interrupted: false,
    }).success).toBe(false)
  })
})
