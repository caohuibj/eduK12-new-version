import { describe, expect, it } from 'vitest'
import { seqlearnConfigSchema } from '../../modules/cognitive/schemas/seqlearn.config'
import { seqlearnTrialSchema } from '../../modules/cognitive/schemas/seqlearn.trial'

const config = {
  totalTrials: 60,
  trialsPerBlock: 10,
  patternSequence: [3, 1, 4, 2, 1, 3, 2, 4, 1, 2],
  randomBlockIndices: [4],
  fixationMs: 300,
  stimulusMs: 1200,
  timeoutMs: 1500,
  validRtFloorMs: 150,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('seqlearn schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(seqlearnConfigSchema.safeParse(config).success).toBe(true)
    expect(seqlearnTrialSchema.safeParse({
      position: 3,
      response: 3,
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects non-divisible trial counts, out-of-range blocks and client-derived fields', () => {
    expect(seqlearnConfigSchema.safeParse({ ...config, totalTrials: 55 }).success).toBe(false)
    expect(seqlearnConfigSchema.safeParse({ ...config, randomBlockIndices: [7] }).success).toBe(false)
    expect(seqlearnConfigSchema.safeParse({ ...config, randomBlockIndices: [1, 2, 3, 4, 5, 6] }).success).toBe(false)
    expect(seqlearnTrialSchema.safeParse({
      position: 3,
      response: 3,
      rtMs: 312,
      interrupted: false,
      isRandomBlock: false,
    }).success).toBe(false)
  })

  it('uses response/rt null together for timeout facts', () => {
    expect(seqlearnTrialSchema.safeParse({
      position: 3,
      response: null,
      rtMs: null,
      interrupted: false,
    }).success).toBe(true)
    expect(seqlearnTrialSchema.safeParse({
      position: 3,
      response: null,
      rtMs: 300,
      interrupted: false,
    }).success).toBe(false)
  })
})
