import { describe, expect, it } from 'vitest'
import { symbolmatchConfigSchema } from '../../modules/cognitive/schemas/symbolmatch.config'
import { symbolmatchTrialSchema } from '../../modules/cognitive/schemas/symbolmatch.trial'

const config = {
  totalTrials: 40,
  symbolDigitMap: [['●', 1], ['■', 2], ['▲', 3], ['◆', 4], ['★', 5]] as Array<[string, number]>,
  fixationMs: 400,
  timeoutMs: 8000,
  validRtFloorMs: 250,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('symbolmatch schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(symbolmatchConfigSchema.safeParse(config).success).toBe(true)
    expect(symbolmatchTrialSchema.safeParse({
      symbol: '●',
      response: 1,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects duplicate symbols/digits and client-derived fields', () => {
    expect(symbolmatchConfigSchema.safeParse({ ...config, symbolDigitMap: [['●', 1], ['●', 2], ['▲', 3], ['◆', 4], ['★', 5]] }).success).toBe(false)
    expect(symbolmatchConfigSchema.safeParse({ ...config, symbolDigitMap: [['●', 1], ['■', 1], ['▲', 3], ['◆', 4], ['★', 5]] }).success).toBe(false)
    expect(symbolmatchTrialSchema.safeParse({
      symbol: '●',
      response: 1,
      rtMs: 312,
      interrupted: false,
      isCorrect: true,
    }).success).toBe(false)
  })

  it('uses response/rt null together for timeout facts', () => {
    expect(symbolmatchTrialSchema.safeParse({
      symbol: '●',
      response: null,
      rtMs: null,
      interrupted: false,
    }).success).toBe(true)
    expect(symbolmatchTrialSchema.safeParse({
      symbol: '●',
      response: null,
      rtMs: 300,
      interrupted: false,
    }).success).toBe(false)
  })
})
