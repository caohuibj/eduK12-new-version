import { describe, expect, it } from 'vitest'
import { wordanalogyConfigSchema } from '../../modules/cognitive/schemas/wordanalogy.config'
import { wordanalogyTrialSchema } from '../../modules/cognitive/schemas/wordanalogy.trial'

const config = {
  totalTrials: 30,
  stimulusSetVersion: 'wordanalogy-zh-v1.0.0',
  fixationMs: 400,
  timeoutMs: 15000,
  validRtFloorMs: 300,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('wordanalogy schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(wordanalogyConfigSchema.safeParse(config).success).toBe(true)
    expect(wordanalogyTrialSchema.safeParse({
      itemId: 'wa-01',
      responseIndex: 0,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
    expect(wordanalogyTrialSchema.safeParse({
      itemId: 'wa-01',
      responseIndex: null,
      rtMs: null,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects out-of-range responses and client-derived fields', () => {
    expect(wordanalogyTrialSchema.safeParse({
      itemId: 'wa-01',
      responseIndex: 4,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(false)
    expect(wordanalogyTrialSchema.safeParse({
      itemId: 'wa-01',
      responseIndex: 0,
      rtMs: 312,
      interrupted: false,
      isCorrect: true,
    }).success).toBe(false)
  })
})
