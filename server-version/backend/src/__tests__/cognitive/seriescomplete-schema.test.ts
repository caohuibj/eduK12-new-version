import { describe, expect, it } from 'vitest'
import { seriescompleteConfigSchema } from '../../modules/cognitive/schemas/seriescomplete.config'
import { seriescompleteTrialSchema } from '../../modules/cognitive/schemas/seriescomplete.trial'

const config = {
  totalTrials: 30,
  stimulusSetVersion: 'seriescomplete-zh-v1.0.0',
  fixationMs: 400,
  timeoutMs: 15000,
  validRtFloorMs: 300,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('seriescomplete schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(seriescompleteConfigSchema.safeParse(config).success).toBe(true)
    expect(seriescompleteTrialSchema.safeParse({
      itemId: 'wa-01',
      responseIndex: 0,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
    expect(seriescompleteTrialSchema.safeParse({
      itemId: 'wa-01',
      responseIndex: null,
      rtMs: null,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects out-of-range responses and client-derived fields', () => {
    expect(seriescompleteTrialSchema.safeParse({
      itemId: 'wa-01',
      responseIndex: 4,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(false)
    expect(seriescompleteTrialSchema.safeParse({
      itemId: 'wa-01',
      responseIndex: 0,
      rtMs: 312,
      interrupted: false,
      isCorrect: true,
    }).success).toBe(false)
  })
})
