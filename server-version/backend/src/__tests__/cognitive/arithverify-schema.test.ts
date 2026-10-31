import { describe, expect, it } from 'vitest'
import { arithverifyConfigSchema } from '../../modules/cognitive/schemas/arithverify.config'
import { arithverifyTrialSchema } from '../../modules/cognitive/schemas/arithverify.trial'

const config = {
  totalTrials: 30,
  operandMax: 10,
  trueRatio: 0.5,
  fixationMs: 500,
  timeoutMs: 6000,
  validRtFloorMs: 200,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('arithverify schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(arithverifyConfigSchema.safeParse(config).success).toBe(true)
    expect(arithverifyTrialSchema.safeParse({
      leftOperand: 3,
      rightOperand: 4,
      displayedResult: 7,
      response: true,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects unbalanced conditions and client-derived fields', () => {
    expect(arithverifyConfigSchema.safeParse({ ...config, trueRatio: 0 }).success).toBe(false)
    expect(arithverifyConfigSchema.safeParse({ ...config, operandMax: 1 }).success).toBe(false)
    expect(arithverifyTrialSchema.safeParse({
      leftOperand: 3,
      rightOperand: 4,
      displayedResult: 7,
      response: true,
      rtMs: 312,
      interrupted: false,
      isCorrect: true,
    }).success).toBe(false)
  })

  it('uses response/rt null together for timeout facts', () => {
    expect(arithverifyTrialSchema.safeParse({
      leftOperand: 3,
      rightOperand: 4,
      displayedResult: 7,
      response: null,
      rtMs: null,
      interrupted: false,
    }).success).toBe(true)
    expect(arithverifyTrialSchema.safeParse({
      leftOperand: 3,
      rightOperand: 4,
      displayedResult: 7,
      response: null,
      rtMs: 300,
      interrupted: false,
    }).success).toBe(false)
  })
})
