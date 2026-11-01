import { describe, expect, it } from 'vitest'
import { trustgameConfigSchema } from '../../modules/cognitive/schemas/trustgame.config'
import { trustgameTrialSchema } from '../../modules/cognitive/schemas/trustgame.trial'

const config = {
  offers: [50, 20, 80, 10, 40, 30, 60, 20],
  potTotal: 100,
  fixationMs: 400,
  timeoutMs: 20000,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('trustgame schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(trustgameConfigSchema.safeParse(config).success).toBe(true)
    expect(trustgameTrialSchema.safeParse({
      roundIndex: 0,
      offerToSelf: 50,
      response: 'accept',
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects full-pot offers and client-derived fields', () => {
    expect(trustgameConfigSchema.safeParse({ ...config, offers: [100, 20] }).success).toBe(false)
    expect(trustgameConfigSchema.safeParse({ ...config, offers: [] }).success).toBe(false)
    expect(trustgameTrialSchema.safeParse({
      roundIndex: 0,
      offerToSelf: 50,
      response: 'accept',
      rtMs: 312,
      interrupted: false,
      isFair: true,
    }).success).toBe(false)
  })

  it('uses response/rt null together for timeout facts', () => {
    expect(trustgameTrialSchema.safeParse({
      roundIndex: 0,
      offerToSelf: 50,
      response: null,
      rtMs: null,
      interrupted: false,
    }).success).toBe(true)
    expect(trustgameTrialSchema.safeParse({
      roundIndex: 0,
      offerToSelf: 50,
      response: null,
      rtMs: 300,
      interrupted: false,
    }).success).toBe(false)
  })
})
