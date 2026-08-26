import { describe, it, expect } from 'vitest'
import { reactionConfigSchema } from '../../modules/cognitive/schemas/reaction.config'
import { reactionTrialSchema } from '../../modules/cognitive/schemas/reaction.trial'

const baseConfig = {
  totalTrials: 20,
  foreperiodMinMs: 700,
  foreperiodMaxMs: 1500,
  timeoutMs: 2000,
  readyDurationMs: 1000,
  report: {
    reportVersion: '1.0.0',
    referenceMode: 'simulated',
    referenceVersion: 'sim-k12-v0.1',
    referenceBand: 'K7-9',
  },
}

describe('reaction config schema', () => {
  it('parses the seed baseline config', () => {
    const parsed = reactionConfigSchema.safeParse(baseConfig)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data).toEqual(baseConfig)
  })

  it('allows smaller totalTrials for test/CI configs', () => {
    expect(reactionConfigSchema.safeParse({ ...baseConfig, totalTrials: 5 }).success).toBe(true)
  })

  it('rejects missing totalTrials', () => {
    const { totalTrials, ...rest } = baseConfig
    expect(reactionConfigSchema.safeParse(rest).success).toBe(false)
  })

  it('rejects non-positive timeoutMs', () => {
    expect(reactionConfigSchema.safeParse({ ...baseConfig, timeoutMs: 0 }).success).toBe(false)
  })

  it('rejects invalid referenceMode', () => {
    expect(
      reactionConfigSchema.safeParse({ ...baseConfig, report: { ...baseConfig.report, referenceMode: 'percentile' } }).success
    ).toBe(false)
  })

  it('rejects extra undeclared fields', () => {
    expect(reactionConfigSchema.safeParse({ ...baseConfig, stimulus: 'x' }).success).toBe(false)
  })
})

describe('reaction trial schema', () => {
  const baseTrial = {
    foreperiodMs: 1180,
    rtMs: 312,
    prematureCount: 0,
    interrupted: false,
    inputMode: 'pointer' as const,
  }

  it('parses a valid hit trial', () => {
    expect(reactionTrialSchema.safeParse(baseTrial).success).toBe(true)
  })

  it('rounds fractional rtMs', () => {
    const parsed = reactionTrialSchema.safeParse({ ...baseTrial, rtMs: 320.6 })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.rtMs).toBe(321)
  })

  it('parses a timeout/miss trial (rtMs null)', () => {
    expect(reactionTrialSchema.safeParse({ ...baseTrial, rtMs: null }).success).toBe(true)
  })

  it('parses all inputMode enum values', () => {
    expect(reactionTrialSchema.safeParse({ ...baseTrial, inputMode: 'touch' }).success).toBe(true)
    expect(reactionTrialSchema.safeParse({ ...baseTrial, inputMode: 'keyboard' }).success).toBe(true)
  })

  it('rejects negative foreperiodMs', () => {
    expect(reactionTrialSchema.safeParse({ ...baseTrial, foreperiodMs: -1 }).success).toBe(false)
  })

  it('rejects invalid inputMode', () => {
    expect(reactionTrialSchema.safeParse({ ...baseTrial, inputMode: 'mouse' }).success).toBe(false)
  })

  it('rejects extra fields', () => {
    expect(reactionTrialSchema.safeParse({ ...baseTrial, valid: true }).success).toBe(false)
  })
})
