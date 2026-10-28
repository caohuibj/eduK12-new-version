import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreEmbeddedfiguresV1 } from '../../modules/cognitive/scoring/embeddedfigures.v1'
import { embeddedfiguresItem } from '../../modules/cognitive/tasks/embeddedfigures/generator'
import type { EmbeddedfiguresConfig } from '../../modules/cognitive/schemas/embeddedfigures.config'
import type { EmbeddedfiguresTrial } from '../../modules/cognitive/schemas/embeddedfigures.trial'

const config: EmbeddedfiguresConfig = {
  totalTrials: 4,
  stimulusSetVersion: 'embeddedfigures-zh-v1.0.0',
  showTargetMs: 3000,
  timeoutMs: 15000,
  validRtFloorMs: 400,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, clickedShapeId: string | null, rtMs: number | null = 900): { trialIndex: number; payload: EmbeddedfiguresTrial } => ({
  trialIndex: index,
  payload: { itemIndex: index, clickedShapeId, rtMs, interrupted: false },
})

describe('embeddedfigures scorer', () => {
  it('regenerates fields from seed and derives correctness server-side', () => {
    const answers = [0, 1, 2, 3].map((index) => embeddedfiguresItem('seed-1', index).targetId)
    const result = scoreEmbeddedfiguresV1({
      config,
      randomSeed: 'seed-1',
      trials: answers.map((targetId, index) => trial(index, targetId)),
    })
    expect(result.score).toBe(100)
    expect(result.metrics).toMatchObject({ accuracy: 1, errorCount: 0, timeoutCount: 0, validRtCount: 4 })
    expect(result.qualityFlags.interpretable).toBe(true)
  })

  it('flags low accuracy and insufficient valid RT when all wrong', () => {
    const wrong = [0, 1, 2, 3].map((index) => `wrong-${index}`)
    const result = scoreEmbeddedfiguresV1({
      config,
      randomSeed: 'seed-1',
      trials: wrong.map((clickedShapeId, index) => trial(index, clickedShapeId)),
    })
    expect(result.metrics.accuracy).toBe(0)
    expect(result.metrics.validRtCount).toBe(0)
    expect(result.qualityFlags.lowAccuracy).toBe(true)
    expect(result.qualityFlags.insufficientValidRt).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
    expect(result.score).toBe(0)
  })

  it('rejects item-order mismatches, wrong counts and wrong stimulus set versions', () => {
    expect(() => scoreEmbeddedfiguresV1({
      config,
      randomSeed: 'seed-1',
      trials: [
        { trialIndex: 0, payload: { itemIndex: 1, clickedShapeId: 's0', rtMs: 900, interrupted: false } },
        trial(1, 's0'), trial(2, 's0'), trial(3, 's0'),
      ],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreEmbeddedfiguresV1({ config, randomSeed: 'seed-1', trials: [trial(0, 's0')] })).toThrow(CognitiveScoringInputError)
    expect(() => scoreEmbeddedfiguresV1({
      config: { ...config, stimulusSetVersion: 'embeddedfigures-zh-v9.9.9' },
      randomSeed: 'seed-1',
      trials: [trial(0, 's0'), trial(1, 's0'), trial(2, 's0'), trial(3, 's0')],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreEmbeddedfiguresV1({ config, trials: [trial(0, 's0'), trial(1, 's0'), trial(2, 's0'), trial(3, 's0')] })).toThrow(CognitiveScoringInputError)
  })
})
