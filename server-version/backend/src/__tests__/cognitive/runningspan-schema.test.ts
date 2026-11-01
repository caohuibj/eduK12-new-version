import { describe, expect, it } from 'vitest'
import { runningspanConfigSchema } from '../../modules/cognitive/schemas/runningspan.config'
import { runningspanTrialSchema } from '../../modules/cognitive/schemas/runningspan.trial'

const config = {
  totalTrials: 12,
  listLengthMin: 7,
  listLengthMax: 11,
  recallLength: 3,
  stimulusMs: 500,
  isiMs: 250,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('runningspan schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(runningspanConfigSchema.safeParse(config).success).toBe(true)
    expect(runningspanTrialSchema.safeParse({
      sequence: ['B', 'C', 'D', 'F', 'H', 'J', 'K'],
      response: ['F', 'H', 'K'],
      responseDurationMs: 3200,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects recall >= shortest list and invalid lengths', () => {
    expect(runningspanConfigSchema.safeParse({ ...config, recallLength: 7 }).success).toBe(false)
    expect(runningspanConfigSchema.safeParse({ ...config, listLengthMin: 12 }).success).toBe(false)
    // 回忆长度上限是 config 层约束，由 scorer 校验（schema 不知道 recallLength）。
  })

  it('allows empty responses and requires nonnegative duration', () => {
    expect(runningspanTrialSchema.safeParse({
      sequence: ['B', 'C', 'D', 'F', 'H'],
      response: [],
      responseDurationMs: 900,
      interrupted: false,
    }).success).toBe(true)
    expect(runningspanTrialSchema.safeParse({
      sequence: ['B', 'C', 'D', 'F', 'H'],
      response: [],
      responseDurationMs: -1,
      interrupted: false,
    }).success).toBe(false)
  })
})
