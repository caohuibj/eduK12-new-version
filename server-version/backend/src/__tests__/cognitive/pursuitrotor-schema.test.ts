import { describe, expect, it } from 'vitest'
import { pursuitrotorConfigSchema } from '../../modules/cognitive/schemas/pursuitrotor.config'
import { pursuitrotorTrialSchema } from '../../modules/cognitive/schemas/pursuitrotor.trial'

const config = {
  totalTrials: 4,
  trackMs: 20000,
  revolutionMs: 4000,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('pursuitrotor schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(pursuitrotorConfigSchema.safeParse(config).success).toBe(true)
    expect(pursuitrotorTrialSchema.safeParse({
      trialIndex: 0,
      timeOnTargetMs: 12000,
      totalTrackMs: 20000,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects timeOnTarget > totalTrack and client-derived fields', () => {
    expect(pursuitrotorTrialSchema.safeParse({
      trialIndex: 0,
      timeOnTargetMs: 25000,
      totalTrackMs: 20000,
      interrupted: false,
    }).success).toBe(false)
    expect(pursuitrotorTrialSchema.safeParse({
      trialIndex: 0,
      timeOnTargetMs: 12000,
      totalTrackMs: 20000,
      interrupted: false,
      onTargetRate: 0.6,
    }).success).toBe(false)
  })
})
