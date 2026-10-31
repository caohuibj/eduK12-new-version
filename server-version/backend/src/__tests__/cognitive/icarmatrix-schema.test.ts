import { describe, expect, it } from 'vitest'
import { icarmatrixConfigSchema } from '../../modules/cognitive/schemas/icarmatrix.config'
import { icarmatrixTrialSchema } from '../../modules/cognitive/schemas/icarmatrix.trial'

const config = {
  totalTrials: 16,
  stimulusSetVersion: 'icarmatrix-gen-v1.0.0',
  fixationMs: 400,
  timeoutMs: 30000,
  validRtFloorMs: 500,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('icarmatrix schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(icarmatrixConfigSchema.safeParse(config).success).toBe(true)
    expect(icarmatrixTrialSchema.safeParse({
      itemIndex: 0,
      responseIndex: 1,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects out-of-range responses and client-derived fields', () => {
    expect(icarmatrixTrialSchema.safeParse({
      itemIndex: 0,
      responseIndex: 6,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(false)
    expect(icarmatrixTrialSchema.safeParse({
      itemIndex: 0,
      responseIndex: 1,
      rtMs: 312,
      interrupted: false,
      isCorrect: true,
    }).success).toBe(false)
  })

  it('uses responseIndex/rt null together for timeout facts', () => {
    expect(icarmatrixTrialSchema.safeParse({
      itemIndex: 0,
      responseIndex: null,
      rtMs: null,
      interrupted: false,
    }).success).toBe(true)
    expect(icarmatrixTrialSchema.safeParse({
      itemIndex: 0,
      responseIndex: null,
      rtMs: 300,
      interrupted: false,
    }).success).toBe(false)
  })
})
