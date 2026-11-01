import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreIcarmatrixV1 } from '../../modules/cognitive/scoring/icarmatrix.v1'
import { icarmatrixItem } from '../../modules/cognitive/tasks/icarmatrix/generator'
import type { IcarmatrixConfig } from '../../modules/cognitive/schemas/icarmatrix.config'
import type { IcarmatrixTrial } from '../../modules/cognitive/schemas/icarmatrix.trial'

const config: IcarmatrixConfig = {
  totalTrials: 4,
  stimulusSetVersion: 'icarmatrix-gen-v1.0.0',
  fixationMs: 400,
  timeoutMs: 30000,
  validRtFloorMs: 500,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, responseIndex: number | null, rtMs: number | null = 900): { trialIndex: number; payload: IcarmatrixTrial } => ({
  trialIndex: index,
  payload: { itemIndex: index, responseIndex, rtMs, interrupted: false },
})

describe('icarmatrix scorer', () => {
  it('regenerates items from seed and derives correctness server-side', () => {
    const answers = [0, 1, 2, 3].map((index) => icarmatrixItem('seed-1', index).answerIndex)
    const result = scoreIcarmatrixV1({
      config,
      randomSeed: 'seed-1',
      trials: [trial(0, answers[0]), trial(1, answers[1]), trial(2, answers[2]), trial(3, answers[3])],
    })
    expect(result.score).toBe(100)
    expect(result.metrics).toMatchObject({ accuracy: 1, errorCount: 0, timeoutCount: 0, validRtCount: 4 })
    expect(result.qualityFlags.interpretable).toBe(true)
  })

  it('flags low accuracy and insufficient valid RT when all wrong', () => {
    const answers = [0, 1, 2, 3].map((index) => icarmatrixItem('seed-1', index).answerIndex)
    const wrong = (answer: number): number => (answer + 1) % 6
    const result = scoreIcarmatrixV1({
      config,
      randomSeed: 'seed-1',
      trials: [trial(0, wrong(answers[0])), trial(1, wrong(answers[1])), trial(2, wrong(answers[2])), trial(3, wrong(answers[3]))],
    })
    expect(result.metrics.accuracy).toBe(0)
    expect(result.metrics.validRtCount).toBe(0)
    expect(result.qualityFlags.lowAccuracy).toBe(true)
    expect(result.qualityFlags.insufficientValidRt).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
    expect(result.score).toBe(0)
  })

  it('rejects item-order mismatches, wrong counts and wrong stimulus set versions', () => {
    expect(() => scoreIcarmatrixV1({
      config,
      randomSeed: 'seed-1',
      trials: [
        { trialIndex: 0, payload: { itemIndex: 1, responseIndex: 0, rtMs: 900, interrupted: false } },
        trial(1, 0), trial(2, 0), trial(3, 0),
      ],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreIcarmatrixV1({ config, randomSeed: 'seed-1', trials: [trial(0, 0)] })).toThrow(CognitiveScoringInputError)
    expect(() => scoreIcarmatrixV1({
      config: { ...config, stimulusSetVersion: 'icarmatrix-gen-v9.9.9' },
      randomSeed: 'seed-1',
      trials: [trial(0, 0), trial(1, 0), trial(2, 0), trial(3, 0)],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreIcarmatrixV1({ config, trials: [trial(0, 0), trial(1, 0), trial(2, 0), trial(3, 0)] })).toThrow(CognitiveScoringInputError)
  })
})
