import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreVisualwmV1 } from '../../modules/cognitive/scoring/visualwm.v1'
import { visualwmTrial } from '../../modules/cognitive/tasks/visualwm/generator'
import type { VisualwmConfig } from '../../modules/cognitive/schemas/visualwm.config'
import type { VisualwmTrial } from '../../modules/cognitive/schemas/visualwm.trial'

const config: VisualwmConfig = {
  totalTrials: 4,
  studyMs: 500,
  retentionMs: 900,
  validRtFloorMs: 200,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, response: 'same' | 'change' | null, rtMs: number | null = 500): { trialIndex: number; payload: VisualwmTrial } => {
  const stimulus = visualwmTrial('seed-1', index)
  return {
    trialIndex: index,
    payload: { setSize: stimulus.setSize, isChange: stimulus.isChange, response, rtMs, interrupted: false },
  }
}

describe('visualwm scorer', () => {
  it('rebuilds stimuli from seed and derives accuracy/hit/FA server-side', () => {
    const stimuli = [0, 1, 2, 3].map((index) => visualwmTrial('seed-1', index))
    const result = scoreVisualwmV1({
      config,
      randomSeed: 'seed-1',
      trials: stimuli.map((stimulus, index) => trial(index, stimulus.isChange ? 'change' : 'same')),
    })
    expect(result.score).toBe(100)
    expect(result.metrics).toMatchObject({ accuracy: 1, correctCount: 4 })
    expect(result.qualityFlags.interpretable).toBe(true)
  })

  it('flags low accuracy when all wrong', () => {
    const stimuli = [0, 1, 2, 3].map((index) => visualwmTrial('seed-1', index))
    const result = scoreVisualwmV1({
      config,
      randomSeed: 'seed-1',
      trials: stimuli.map((stimulus, index) => trial(index, stimulus.isChange ? 'same' : 'change')),
    })
    expect(result.metrics.accuracy).toBe(0)
    expect(result.qualityFlags.lowAccuracy).toBe(true)
    expect(result.metrics.correctCount).toBe(0)
    expect(result.score).toBe(0)
  })

  it('rejects stimulus mismatches, wrong counts and gaps', () => {
    expect(() => scoreVisualwmV1({
      config,
      randomSeed: 'seed-1',
      trials: [
        { trialIndex: 0, payload: { setSize: 99, isChange: true, response: 'change', rtMs: 500, interrupted: false } },
        trial(1, 'change'), trial(2, 'change'), trial(3, 'change'),
      ],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreVisualwmV1({ config, randomSeed: 'seed-1', trials: [trial(0, 'change')] })).toThrow(CognitiveScoringInputError)
    expect(() => scoreVisualwmV1({ config, trials: [trial(0, 'change'), trial(1, 'change'), trial(2, 'change'), trial(3, 'change')] })).toThrow(CognitiveScoringInputError)
  })
})
