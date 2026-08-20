import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreStroopV1 } from '../../modules/cognitive/scoring/stroop.v1'
import type { StroopConfig } from '../../modules/cognitive/schemas/stroop.config'
import type { StroopTrial } from '../../modules/cognitive/schemas/stroop.trial'

const config: StroopConfig = {
  totalTrials: 4,
  congruentRatio: 0.5,
  fixationMs: 500,
  stimulusDurationMs: 2000,
  isiMs: 500,
  validRtFloorMs: 200,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const hit = (word: StroopTrial['word'], inkColor: StroopTrial['inkColor'], rtMs: number): StroopTrial => ({
  word,
  inkColor,
  response: inkColor,
  rtMs,
  interrupted: false,
})

describe('stroop scorer', () => {
  it('derives conditions/correctness and computes the frozen metrics/index', () => {
    const result = scoreStroopV1({
      config,
      trials: [
        { trialIndex: 0, payload: hit('红', 'red', 300) },
        { trialIndex: 1, payload: hit('蓝', 'blue', 350) },
        { trialIndex: 2, payload: hit('红', 'green', 500) },
        { trialIndex: 3, payload: hit('黄', 'blue', 550) },
      ],
    })
    expect(result.score).toBe(100)
    expect(result.metrics).toMatchObject({
      medianRtCongruent: 325,
      medianRtIncongruent: 525,
      stroopEffectMs: 200,
      errorCost: 0,
      accuracy: 1,
      timeoutCount: 0,
      validCongruentRtCount: 2,
      validIncongruentRtCount: 2,
    })
    expect(result.qualityFlags.interpretable).toBe(true)
  })

  it('uses overall accuracy for the Product Index and derives timeout/error cost', () => {
    const result = scoreStroopV1({
      config,
      trials: [
        { trialIndex: 0, payload: hit('红', 'red', 300) },
        { trialIndex: 1, payload: hit('蓝', 'blue', 350) },
        { trialIndex: 2, payload: { ...hit('红', 'green', 500), response: 'red' } },
        { trialIndex: 3, payload: { word: '黄', inkColor: 'blue', response: null, rtMs: null, interrupted: false } },
      ],
    })
    expect(result.score).toBe(50)
    expect(result.metrics).toMatchObject({ timeoutCount: 1, errorCost: 1, accuracy: 0.5 })
  })

  it('applies the valid RT floor and requires exact condition balance', () => {
    const result = scoreStroopV1({
      config,
      trials: [
        { trialIndex: 0, payload: hit('红', 'red', 100) },
        { trialIndex: 1, payload: hit('蓝', 'blue', 350) },
        { trialIndex: 2, payload: hit('红', 'green', 500) },
        { trialIndex: 3, payload: hit('黄', 'blue', 550) },
      ],
    })
    expect(result.metrics.validCongruentRtCount).toBe(1)
    expect(result.qualityFlags.insufficientValidCongruentRt).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)

    expect(() => scoreStroopV1({
      config,
      trials: Array.from({ length: 4 }, (_, index) => ({ trialIndex: index, payload: hit('红', 'red', 300) })),
    })).toThrow(CognitiveScoringInputError)
  })
})
