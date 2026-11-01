import { describe, expect, it } from 'vitest'
import { gamblingdeckConfigSchema } from '../../modules/cognitive/schemas/gamblingdeck.config'
import { gamblingdeckTrialSchema } from '../../modules/cognitive/schemas/gamblingdeck.trial'

const config = {
  totalTrials: 60,
  blockSize: 20,
  fixationMs: 400,
  feedbackMs: 1200,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('gamblingdeck schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(gamblingdeckConfigSchema.safeParse(config).success).toBe(true)
    expect(gamblingdeckTrialSchema.safeParse({
      deck: 'C',
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects unknown decks and client-derived facts', () => {
    expect(gamblingdeckTrialSchema.safeParse({
      deck: 'E',
      rtMs: 312,
      interrupted: false,
    }).success).toBe(false)
    expect(gamblingdeckTrialSchema.safeParse({
      deck: 'A',
      netResult: -150,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(false)
    expect(gamblingdeckConfigSchema.safeParse({ ...config, blockSize: 0 }).success).toBe(false)
  })

  it('keeps rt optional for self-paced choices', () => {
    expect(gamblingdeckTrialSchema.safeParse({
      deck: 'A',
      rtMs: null,
      interrupted: false,
    }).success).toBe(true)
  })
})
