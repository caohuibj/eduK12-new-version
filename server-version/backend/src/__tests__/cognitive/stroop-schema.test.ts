import { describe, expect, it } from 'vitest'
import { stroopConfigSchema } from '../../modules/cognitive/schemas/stroop.config'
import { stroopTrialSchema } from '../../modules/cognitive/schemas/stroop.trial'

const config = {
  totalTrials: 24,
  congruentRatio: 0.5,
  fixationMs: 500,
  stimulusDurationMs: 2000,
  isiMs: 500,
  validRtFloorMs: 200,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('stroop schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(stroopConfigSchema.safeParse(config).success).toBe(true)
    expect(stroopTrialSchema.safeParse({
      word: '红',
      inkColor: 'green',
      response: 'green',
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects unbalanced conditions and client-derived fields', () => {
    expect(stroopConfigSchema.safeParse({ ...config, congruentRatio: 0 }).success).toBe(false)
    expect(stroopTrialSchema.safeParse({
      word: '红',
      inkColor: 'green',
      response: 'green',
      rtMs: 312,
      interrupted: false,
      isCorrect: true,
    }).success).toBe(false)
  })

  it('uses response/rt null together for timeout facts', () => {
    expect(stroopTrialSchema.safeParse({
      word: '红',
      inkColor: 'green',
      response: null,
      rtMs: null,
      interrupted: false,
    }).success).toBe(true)
    expect(stroopTrialSchema.safeParse({
      word: '红',
      inkColor: 'green',
      response: null,
      rtMs: 300,
      interrupted: false,
    }).success).toBe(false)
  })
})
