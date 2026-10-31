import { describe, expect, it } from 'vitest'
import { embeddedfiguresConfigSchema } from '../../modules/cognitive/schemas/embeddedfigures.config'
import { embeddedfiguresTrialSchema } from '../../modules/cognitive/schemas/embeddedfigures.trial'

const config = {
  totalTrials: 10,
  stimulusSetVersion: 'embeddedfigures-zh-v1.0.0',
  showTargetMs: 3000,
  timeoutMs: 15000,
  validRtFloorMs: 400,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

describe('embeddedfigures schemas', () => {
  it('parses the minimal observable payload', () => {
    expect(embeddedfiguresConfigSchema.safeParse(config).success).toBe(true)
    expect(embeddedfiguresTrialSchema.safeParse({
      itemIndex: 0,
      clickedShapeId: 's0',
      rtMs: 312,
      interrupted: false,
    }).success).toBe(true)
  })

  it('rejects client-derived fields', () => {
    expect(embeddedfiguresTrialSchema.safeParse({
      itemIndex: 0,
      clickedShapeId: 's0',
      rtMs: 312,
      interrupted: false,
      isTarget: true,
    }).success).toBe(false)
  })

  it('uses clickedShapeId/rt null together for timeout facts', () => {
    expect(embeddedfiguresTrialSchema.safeParse({
      itemIndex: 0,
      clickedShapeId: null,
      rtMs: null,
      interrupted: false,
    }).success).toBe(true)
    expect(embeddedfiguresTrialSchema.safeParse({
      itemIndex: 0,
      clickedShapeId: null,
      rtMs: 300,
      interrupted: false,
    }).success).toBe(false)
  })
})
