import { describe, expect, it } from 'vitest'
import { lineangleConfigSchema } from '../../modules/cognitive/schemas/lineangle.config'
import { lineangleTrialSchema } from '../../modules/cognitive/schemas/lineangle.trial'

const config = {
  totalTrials: 30,
  angleStepDeg: 15,
  optionCount: 4,
  minAngleSepSteps: 2,
  fixationMs: 500,
  timeoutMs: 8000,
  validRtFloorMs: 300,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('lineangle schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(lineangleConfigSchema.safeParse(config).success).toBe(true)
    expect(lineangleTrialSchema.safeParse({
      targetAngle: 60,
      optionAngles: [30, 60, 105, 150],
      responseAngle: 60,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects out-of-range angles and client-derived fields', () => {
    expect(lineangleTrialSchema.safeParse({
      targetAngle: 200,
      optionAngles: [30, 60, 105, 150],
      responseAngle: 60,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(false)
    expect(lineangleTrialSchema.safeParse({
      targetAngle: 60,
      optionAngles: [30, 60, 105, 150],
      responseAngle: 60,
      rtMs: 312,
      interrupted: false,
      isCorrect: true,
    }).success).toBe(false)
    expect(lineangleConfigSchema.safeParse({ ...config, angleStepDeg: 3 }).success).toBe(false)
  })

  it('uses responseAngle/rt null together for timeout facts', () => {
    expect(lineangleTrialSchema.safeParse({
      targetAngle: 60,
      optionAngles: [30, 60, 105, 150],
      responseAngle: null,
      rtMs: null,
      interrupted: false,
    }).success).toBe(true)
    expect(lineangleTrialSchema.safeParse({
      targetAngle: 60,
      optionAngles: [30, 60, 105, 150],
      responseAngle: null,
      rtMs: 300,
      interrupted: false,
    }).success).toBe(false)
  })
})
