import { describe, it, expect } from 'vitest'
import { scoreFakeV1 } from '../../modules/cognitive/scoring/fake.v1'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { FakeConfig } from '../../modules/cognitive/schemas/fake.config'
import { FakeTrial } from '../../modules/cognitive/schemas/fake.trial'
import { ScoringTrial } from '../../modules/cognitive/cognitive.types'

const CONFIG: FakeConfig = {
  trialCount: 3,
  trialDurationMs: 1000,
  allowPractice: false,
  maxRtMs: 60000,
}

const trial = (trialIndex: number, correct: boolean, rtMs: number): ScoringTrial<FakeTrial> => ({
  trialIndex,
  payload: { correct, rtMs },
})

describe('fake v1 scorer', () => {
  it('scores 3 trials with 2 correct -> accuracy ~0.6667, score ~66.67', () => {
    const result = scoreFakeV1({
      config: CONFIG,
      trials: [trial(0, true, 400), trial(1, true, 500), trial(2, false, 600)],
    })
    expect(result.metrics.trialCount).toBe(3)
    expect(result.metrics.correctCount).toBe(2)
    expect(result.metrics.accuracy as number).toBeCloseTo(0.6667, 4)
    expect(result.metrics.meanRtMs as number).toBe(500)
    expect(result.score).toBeCloseTo(66.67, 2)
    expect(result.qualityFlags).toEqual({})
  })

  it('scores trials regardless of arrival order (sorts by trialIndex)', () => {
    const result = scoreFakeV1({
      config: CONFIG,
      trials: [trial(2, false, 600), trial(0, true, 400), trial(1, true, 500)],
    })
    expect(result.metrics.correctCount).toBe(2)
    expect(result.score).toBeCloseTo(66.67, 2)
  })

  it('rejects too few trials', () => {
    expect(() =>
      scoreFakeV1({ config: CONFIG, trials: [trial(0, true, 400), trial(1, true, 500)] })
    ).toThrow(CognitiveScoringInputError)
  })

  it('rejects too many trials', () => {
    expect(() =>
      scoreFakeV1({
        config: CONFIG,
        trials: [trial(0, true, 400), trial(1, true, 500), trial(2, false, 600), trial(3, true, 700)],
      })
    ).toThrow(CognitiveScoringInputError)
  })

  it('rejects an index gap', () => {
    expect(() =>
      scoreFakeV1({
        config: CONFIG,
        trials: [trial(0, true, 400), trial(1, true, 500), trial(3, false, 600)],
      })
    ).toThrow(CognitiveScoringInputError)
  })

  it('rejects a duplicate index', () => {
    expect(() =>
      scoreFakeV1({
        config: CONFIG,
        trials: [trial(0, true, 400), trial(0, true, 500), trial(1, false, 600)],
      })
    ).toThrow(CognitiveScoringInputError)
  })

  it('rejects rtMs above maxRtMs', () => {
    expect(() =>
      scoreFakeV1({
        config: CONFIG,
        trials: [trial(0, true, 400), trial(1, true, 500), trial(2, false, 60001)],
      })
    ).toThrow(CognitiveScoringInputError)
  })
})
