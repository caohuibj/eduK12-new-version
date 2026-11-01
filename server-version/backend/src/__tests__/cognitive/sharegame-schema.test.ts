import { describe, expect, it } from 'vitest'
import { sharegameConfigSchema } from '../../modules/cognitive/schemas/sharegame.config'
import { sharegameTrialSchema } from '../../modules/cognitive/schemas/sharegame.trial'

const config = {
  endowments: [20, 50, 100, 50, 100],
  fixationMs: 400,
  timeoutMs: 20000,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('sharegame schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(sharegameConfigSchema.safeParse(config).success).toBe(true)
    expect(sharegameTrialSchema.safeParse({
      endowment: 20,
      given: 5,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects empty endowments, client-derived fields and over-giving', () => {
    expect(sharegameConfigSchema.safeParse({ ...config, endowments: [] }).success).toBe(false)
    expect(sharegameConfigSchema.safeParse({ ...config, endowments: [20, 0] }).success).toBe(false)
    expect(sharegameTrialSchema.safeParse({
      endowment: 20,
      given: 25,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(false)
    expect(sharegameTrialSchema.safeParse({
      endowment: 20,
      given: 5,
      rtMs: 312,
      interrupted: false,
      givingRate: 0.25,
    }).success).toBe(false)
  })
})
