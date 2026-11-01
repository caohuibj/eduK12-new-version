import { describe, expect, it } from 'vitest'
import { ufovConfigSchema } from '../../modules/cognitive/schemas/ufov.config'
import { ufovTrialSchema } from '../../modules/cognitive/schemas/ufov.trial'

const config = {
  totalTrials: 16,
  stimulusMs: 400,
  fixationMs: 500,
  validRtFloorMs: 200,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('ufov schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(ufovConfigSchema.safeParse(config).success).toBe(true)
    expect(ufovTrialSchema.safeParse({
      centralTarget: 'circle',
      peripheralPosition: 3,
      centralResponse: 0,
      peripheralResponse: 3,
      rtMs: 500,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects out-of-range positions and client-derived fields', () => {
    expect(ufovTrialSchema.safeParse({
      centralTarget: 'circle',
      peripheralPosition: 8,
      centralResponse: 0,
      peripheralResponse: 8,
      rtMs: 500,
      interrupted: false,
    }).success).toBe(false)
    expect(ufovTrialSchema.safeParse({
      centralTarget: 'circle',
      peripheralPosition: 3,
      centralResponse: 0,
      peripheralResponse: 3,
      rtMs: 500,
      interrupted: false,
      dualCorrect: true,
    }).success).toBe(false)
  })

  it('uses paired null responses for timeout facts', () => {
    expect(ufovTrialSchema.safeParse({
      centralTarget: 'circle',
      peripheralPosition: 3,
      centralResponse: null,
      peripheralResponse: null,
      rtMs: null,
      interrupted: false,
    }).success).toBe(true)
  })
})
