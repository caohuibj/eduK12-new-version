import { describe, expect, it } from 'vitest'
import { logicdeduceConfigSchema } from '../../modules/cognitive/schemas/logicdeduce.config'
import { logicdeduceTrialSchema } from '../../modules/cognitive/schemas/logicdeduce.trial'

const config = {
  totalTrials: 30,
  stimulusSetVersion: 'logicdeduce-zh-v1.0.0',
  fixationMs: 400,
  timeoutMs: 15000,
  validRtFloorMs: 300,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('logicdeduce schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(logicdeduceConfigSchema.safeParse(config).success).toBe(true)
    expect(logicdeduceTrialSchema.safeParse({
      itemId: 'wa-01',
      responseIndex: 0,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
    expect(logicdeduceTrialSchema.safeParse({
      itemId: 'wa-01',
      responseIndex: null,
      rtMs: null,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects out-of-range responses and client-derived fields', () => {
    expect(logicdeduceTrialSchema.safeParse({
      itemId: 'wa-01',
      responseIndex: 4,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(false)
    expect(logicdeduceTrialSchema.safeParse({
      itemId: 'wa-01',
      responseIndex: 0,
      rtMs: 312,
      interrupted: false,
      isCorrect: true,
    }).success).toBe(false)
  })
})
