import { describe, expect, it } from 'vitest'
import { memoryConfigSchema } from '../../modules/cognitive/schemas/memory.config'
import { memoryTrialSchema } from '../../modules/cognitive/schemas/memory.trial'

const config = {
  startLength: 2,
  maxLength: 11,
  trialsPerLevel: 2,
  digitDisplayMs: 800,
  digitIntervalMs: 200,
  readyDurationMs: 1000,
  inactivityGuardMs: 30000,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

const baseTrial = {
  length: 3,
  trialWithinLevel: 1 as const,
  sequence: [1, 2, 3],
  response: [1, 2, 4],
  responseDurationMs: 600,
  interrupted: false,
}

describe('memory schemas', () => {
  it('parses the frozen candidate config and trial facts', () => {
    expect(memoryConfigSchema.safeParse(config).success).toBe(true)
    expect(memoryTrialSchema.safeParse(baseTrial).success).toBe(true)
  })

  it('rejects invalid candidate bounds and obsolete config fields', () => {
    expect(memoryConfigSchema.safeParse({ ...config, startLength: 3 }).success).toBe(false)
    expect(memoryConfigSchema.safeParse({ ...config, maxLength: 12 }).success).toBe(false)
    expect(memoryConfigSchema.safeParse({ ...config, feedbackDurationMs: 700 }).success).toBe(false)
  })

  it('requires exact sequence lengths and rejects client scoring fields', () => {
    expect(memoryTrialSchema.safeParse({ ...baseTrial, response: [1, 2] }).success).toBe(false)
    expect(memoryTrialSchema.safeParse({ ...baseTrial, correct: true }).success).toBe(false)
    expect(memoryTrialSchema.safeParse({ ...baseTrial, attempt: 1 }).success).toBe(false)
  })
})
