import { describe, expect, it } from 'vitest'
import { visualwmConfigSchema } from '../../modules/cognitive/schemas/visualwm.config'
import { visualwmTrialSchema } from '../../modules/cognitive/schemas/visualwm.trial'

const config = {
  totalTrials: 16,
  studyMs: 500,
  retentionMs: 900,
  validRtFloorMs: 200,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('visualwm schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(visualwmConfigSchema.safeParse(config).success).toBe(true)
    expect(visualwmTrialSchema.safeParse({
      setSize: 4,
      isChange: true,
      response: 'change',
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects client-derived fields', () => {
    expect(visualwmTrialSchema.safeParse({
      setSize: 4,
      isChange: true,
      response: 'change',
      rtMs: 312,
      interrupted: false,
      accuracy: 1,
    }).success).toBe(false)
  })

  it('rejects set sizes above 6', () => {
    expect(visualwmTrialSchema.safeParse({
      setSize: 7,
      isChange: true,
      response: 'change',
      rtMs: 312,
      interrupted: false,
    }).success).toBe(false)
  })
})
