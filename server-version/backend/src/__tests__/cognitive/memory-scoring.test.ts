import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreMemoryV1 } from '../../modules/cognitive/scoring/memory.v1'
import type { MemoryConfig } from '../../modules/cognitive/schemas/memory.config'
import type { MemoryTrial } from '../../modules/cognitive/schemas/memory.trial'

const config: MemoryConfig = {
  startLength: 2,
  maxLength: 5,
  trialsPerLevel: 2,
  digitDisplayMs: 800,
  digitIntervalMs: 200,
  readyDurationMs: 1000,
  inactivityGuardMs: 30000,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (
  length: number,
  trialWithinLevel: 1 | 2,
  correct: boolean,
  responseDurationMs = trialWithinLevel * 100,
  interrupted = false,
): MemoryTrial => ({
  length,
  trialWithinLevel,
  sequence: Array.from({ length }, (_, index) => index),
  response: correct
    ? Array.from({ length }, (_, index) => index)
    : Array.from({ length }, (_, index) => (index === length - 1 ? 9 : index)),
  responseDurationMs,
  interrupted,
})

describe('memory scorer', () => {
  it('waits for both trials before advancing and calculates the frozen index', () => {
    const result = scoreMemoryV1({
      config,
      trials: [
        { trialIndex: 0, payload: trial(2, 1, true) },
        { trialIndex: 1, payload: trial(2, 2, false) },
        { trialIndex: 2, payload: trial(3, 1, true) },
        { trialIndex: 3, payload: trial(3, 2, false) },
        { trialIndex: 4, payload: trial(4, 1, false) },
        { trialIndex: 5, payload: trial(4, 2, false, 600, true) },
      ],
    })
    expect(result.score).toBe(60)
    expect(result.metrics).toMatchObject({
      maxSpan: 3,
      levelsPassed: 2,
      firstTryPassCount: 2,
      trialCount: 6,
      interruptedCount: 1,
      medianResponseDurationMs: 150,
    })
  })

  it('finishes after a level with zero correct responses', () => {
    const result = scoreMemoryV1({
      config,
      trials: [
        { trialIndex: 0, payload: trial(2, 1, false) },
        { trialIndex: 1, payload: trial(2, 2, false) },
      ],
    })
    expect(result.metrics).toMatchObject({ maxSpan: 0, levelsPassed: 0, trialCount: 2 })
    expect(result.score).toBe(0)
  })

  it('rejects an early completion after only the first trial', () => {
    expect(() => scoreMemoryV1({
      config,
      trials: [{ trialIndex: 0, payload: trial(2, 1, true) }],
    })).toThrow(CognitiveScoringInputError)
  })

  it('rejects skipped levels, a third trial, and trials after a failed level', () => {
    expect(() => scoreMemoryV1({
      config,
      trials: [
        { trialIndex: 0, payload: trial(3, 1, false) },
        { trialIndex: 1, payload: trial(3, 2, false) },
      ],
    })).toThrow(CognitiveScoringInputError)

    expect(() => scoreMemoryV1({
      config,
      trials: [
        { trialIndex: 0, payload: trial(2, 1, true) },
        { trialIndex: 1, payload: trial(2, 2, true) },
        { trialIndex: 2, payload: trial(2, 1, true) },
      ],
    })).toThrow(CognitiveScoringInputError)

    expect(() => scoreMemoryV1({
      config,
      trials: [
        { trialIndex: 0, payload: trial(2, 1, false) },
        { trialIndex: 1, payload: trial(2, 2, false) },
        { trialIndex: 2, payload: trial(3, 1, true) },
        { trialIndex: 3, payload: trial(3, 2, true) },
      ],
    })).toThrow(CognitiveScoringInputError)
  })
})
