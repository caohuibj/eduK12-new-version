import { describe, expect, it } from 'vitest'
import { cancellationConfigSchema } from '../../modules/cognitive/schemas/cancellation.config'
import { cancellationTrialSchema } from '../../modules/cognitive/schemas/cancellation.trial'

const config = {
  totalTrials: 2,
  durationMs: 45000,
  stimulusSetVersion: 'cancellation-zh-v1.0.0',
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('cancellation schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(cancellationConfigSchema.safeParse(config).success).toBe(true)
    expect(cancellationTrialSchema.safeParse({
      scanIndex: 0,
      selectedCells: [3, 17, 42],
      responseDurationMs: 45000,
      interrupted: false,
    }).success).toBe(true)
  })

  it('allows empty selections and rejects client-derived fields', () => {
    expect(cancellationTrialSchema.safeParse({
      scanIndex: 0,
      selectedCells: [],
      responseDurationMs: 45000,
      interrupted: false,
    }).success).toBe(true)
    expect(cancellationTrialSchema.safeParse({
      scanIndex: 0,
      selectedCells: [],
      responseDurationMs: 45000,
      interrupted: false,
      hitRate: 0.9,
    }).success).toBe(false)
  })
})
