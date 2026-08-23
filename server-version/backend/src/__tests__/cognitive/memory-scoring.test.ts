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

describe('memory scorer 1.1.0', () => {
  it('adds totalCorrectTrials without changing the frozen index', async () => {
    const { scoreMemoryV1_1 } = await import('../../modules/cognitive/scoring/memory.v1_1')
    const trials = [
      { trialIndex: 0, payload: trial(2, 1, true) },
      { trialIndex: 1, payload: trial(2, 2, false) },
      { trialIndex: 2, payload: trial(3, 1, true) },
      { trialIndex: 3, payload: trial(3, 2, false) },
      { trialIndex: 4, payload: trial(4, 1, false) },
      { trialIndex: 5, payload: trial(4, 2, false, 600, true) },
    ]
    const result = scoreMemoryV1_1({ config, trials })
    expect(result.score).toBe(60)
    expect(result.metrics.totalCorrectTrials).toBe(2)
    expect(result.qualityFlags.insufficientCompletedLevels).toBe(false)
    expect(result.qualityFlags.interpretable).toBe(true)
  })

  it('marks insufficientCompletedLevels when only one length is finished', async () => {
    const { scoreMemoryV1_1 } = await import('../../modules/cognitive/scoring/memory.v1_1')
    const result = scoreMemoryV1_1({
      config,
      trials: [
        { trialIndex: 0, payload: trial(2, 1, false) },
        { trialIndex: 1, payload: trial(2, 2, false) },
      ],
    })
    expect(result.qualityFlags.insufficientCompletedLevels).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
    expect(scoreMemoryV1({
      config,
      trials: [
        { trialIndex: 0, payload: trial(2, 1, false) },
        { trialIndex: 1, payload: trial(2, 2, false) },
      ],
    }).metrics.totalCorrectTrials).toBeUndefined()
  })

  it('does not flag a correct repeated-digit target as invalid', async () => {
    const { scoreMemoryV1_1 } = await import('../../modules/cognitive/scoring/memory.v1_1')
    const repeats: MemoryTrial = {
      length: 3,
      trialWithinLevel: 1,
      sequence: [5, 5, 5],
      response: [5, 5, 5],
      responseDurationMs: 400,
      interrupted: false,
    }
    const result = scoreMemoryV1_1({
      config,
      trials: [
        { trialIndex: 0, payload: trial(2, 1, true) },
        { trialIndex: 1, payload: trial(2, 2, true) },
        { trialIndex: 2, payload: repeats },
        { trialIndex: 3, payload: { ...repeats, trialWithinLevel: 2 } },
        { trialIndex: 4, payload: trial(4, 1, false) },
        { trialIndex: 5, payload: trial(4, 2, false) },
      ],
    })
    expect(result.qualityFlags.invalidSequencePattern).toBe(false)
    expect(result.metrics.perseverativeTrialCount).toBe(0)
  })

  it('does not flag a single incorrect repeated response', async () => {
    const { scoreMemoryV1_1 } = await import('../../modules/cognitive/scoring/memory.v1_1')
    const stuck: MemoryTrial = {
      length: 2,
      trialWithinLevel: 1,
      sequence: [1, 2],
      response: [0, 0],
      responseDurationMs: 400,
      interrupted: false,
    }
    const result = scoreMemoryV1_1({
      config,
      trials: [
        { trialIndex: 0, payload: stuck },
        { trialIndex: 1, payload: trial(2, 2, false) },
      ],
    })
    expect(result.qualityFlags.invalidSequencePattern).toBe(false)
    expect(result.metrics.perseverativeTrialCount).toBe(1)
  })

  it('flags sustained incorrect repeated responses across trials', async () => {
    const { scoreMemoryV1_1 } = await import('../../modules/cognitive/scoring/memory.v1_1')
    const stuck = (length: number, trialWithinLevel: 1 | 2): MemoryTrial => ({
      length,
      trialWithinLevel,
      sequence: Array.from({ length }, (_, index) => index),
      response: Array.from({ length }, () => 0),
      responseDurationMs: 400,
      interrupted: false,
    })
    const result = scoreMemoryV1_1({
      config,
      trials: [
        { trialIndex: 0, payload: trial(2, 1, true) },
        { trialIndex: 1, payload: stuck(2, 2) },
        { trialIndex: 2, payload: stuck(3, 1) },
        { trialIndex: 3, payload: trial(3, 2, true) },
        { trialIndex: 4, payload: stuck(4, 1) },
        { trialIndex: 5, payload: stuck(4, 2) },
      ],
    })
    expect(result.metrics.perseverativeTrialCount).toBe(4)
    expect(result.qualityFlags.invalidSequencePattern).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
    expect(scoreMemoryV1({
      config,
      trials: [
        { trialIndex: 0, payload: trial(2, 1, true) },
        { trialIndex: 1, payload: stuck(2, 2) },
        { trialIndex: 2, payload: stuck(3, 1) },
        { trialIndex: 3, payload: trial(3, 2, true) },
        { trialIndex: 4, payload: stuck(4, 1) },
        { trialIndex: 5, payload: stuck(4, 2) },
      ],
    }).qualityFlags.invalidSequencePattern).toBeUndefined()
  })
})
