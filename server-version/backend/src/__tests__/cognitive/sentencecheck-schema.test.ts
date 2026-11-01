import { describe, expect, it } from 'vitest'
import { sentencecheckConfigSchema } from '../../modules/cognitive/schemas/sentencecheck.config'
import { sentencecheckTrialSchema } from '../../modules/cognitive/schemas/sentencecheck.trial'

const config = {
  totalTrials: 30,
  trueRatio: 0.5,
  negationRatio: 0.5,
  fixationMs: 500,
  timeoutMs: 8000,
  validRtFloorMs: 300,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('sentencecheck schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(sentencecheckConfigSchema.safeParse(config).success).toBe(true)
    expect(sentencecheckTrialSchema.safeParse({
      shape: 'circle',
      color: 'red',
      questionKind: 'shape',
      negated: false,
      askedValue: '圆形',
      response: true,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects mismatched askedValue and client-derived fields', () => {
    expect(sentencecheckTrialSchema.safeParse({
      shape: 'circle',
      color: 'red',
      questionKind: 'color',
      negated: false,
      askedValue: '圆形',
      response: true,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(false)
    expect(sentencecheckTrialSchema.safeParse({
      shape: 'circle',
      color: 'red',
      questionKind: 'shape',
      negated: false,
      askedValue: '圆形',
      response: true,
      rtMs: 312,
      interrupted: false,
      isTrue: true,
    }).success).toBe(false)
    expect(sentencecheckConfigSchema.safeParse({ ...config, trueRatio: 0 }).success).toBe(false)
  })

  it('uses response/rt null together for timeout facts', () => {
    expect(sentencecheckTrialSchema.safeParse({
      shape: 'circle',
      color: 'red',
      questionKind: 'shape',
      negated: false,
      askedValue: '圆形',
      response: null,
      rtMs: null,
      interrupted: false,
    }).success).toBe(true)
    expect(sentencecheckTrialSchema.safeParse({
      shape: 'circle',
      color: 'red',
      questionKind: 'shape',
      negated: false,
      askedValue: '圆形',
      response: null,
      rtMs: 300,
      interrupted: false,
    }).success).toBe(false)
  })
})
