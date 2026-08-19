import { describe, it, expect } from 'vitest'
import { fakeConfigSchema } from '../../modules/cognitive/schemas/fake.config'
import { fakeTrialSchema } from '../../modules/cognitive/schemas/fake.trial'

describe('fake config schema', () => {
  it('parses the D1 seed baseline config', () => {
    const seed = {
      trialCount: 3,
      trialDurationMs: 1000,
      allowPractice: false,
      maxRtMs: 60000,
    }
    const parsed = fakeConfigSchema.safeParse(seed)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toEqual(seed)
    }
  })

  it('rejects missing trialCount', () => {
    const result = fakeConfigSchema.safeParse({
      trialDurationMs: 1000,
      allowPractice: false,
      maxRtMs: 60000,
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-integer trialCount', () => {
    expect(fakeConfigSchema.safeParse({ trialCount: 3.5, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 }).success).toBe(false)
  })

  it('rejects non-positive trialCount', () => {
    expect(fakeConfigSchema.safeParse({ trialCount: 0, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 }).success).toBe(false)
  })

  it('rejects non-positive maxRtMs', () => {
    expect(fakeConfigSchema.safeParse({ trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 0 }).success).toBe(false)
  })

  it('rejects extra undeclared fields', () => {
    expect(
      fakeConfigSchema.safeParse({ trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000, stimulus: 'x' }).success
    ).toBe(false)
  })
})

describe('fake trial schema', () => {
  it('parses a valid trial payload', () => {
    const parsed = fakeTrialSchema.safeParse({ correct: true, rtMs: 420 })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toEqual({ correct: true, rtMs: 420 })
    }
  })

  it('rejects negative rtMs', () => {
    expect(fakeTrialSchema.safeParse({ correct: true, rtMs: -1 }).success).toBe(false)
  })

  it('rejects non-boolean correct', () => {
    expect(fakeTrialSchema.safeParse({ correct: 'yes', rtMs: 420 }).success).toBe(false)
  })

  it('rejects extra fields', () => {
    expect(fakeTrialSchema.safeParse({ correct: true, rtMs: 420, device: 'ios' }).success).toBe(false)
  })
})
