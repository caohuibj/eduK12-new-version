import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreSizecongruityV1 } from '../../modules/cognitive/scoring/sizecongruity.v1'
import type { SizecongruityConfig } from '../../modules/cognitive/schemas/sizecongruity.config'
import type { SizecongruityTrial } from '../../modules/cognitive/schemas/sizecongruity.trial'

const config: SizecongruityConfig = {
  totalTrials: 4,
  congruentRatio: 0.5,
  minDigit: 1,
  maxDigit: 9,
  minGap: 2,
  fontLargeRem: 2.8,
  fontSmallRem: 1.3,
  fixationMs: 500,
  timeoutMs: 3000,
  validRtFloorMs: 200,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (
  index: number,
  leftDigit: number,
  rightDigit: number,
  leftFontScale: 'large' | 'small',
  response: 'left' | 'right' | null,
  rtMs: number | null
): { trialIndex: number; payload: SizecongruityTrial } => ({
  trialIndex: index,
  payload: { leftDigit, rightDigit, leftFontScale, rightFontScale: leftFontScale === 'large' ? 'small' : 'large', response, rtMs, interrupted: false },
})

describe('sizecongruity scorer', () => {
  it('derives the larger side and condition server-side, then computes the frozen metrics', () => {
    const result = scoreSizecongruityV1({
      config,
      trials: [
        trial(0, 7, 3, 'large', 'left', 400),
        trial(1, 7, 3, 'small', 'left', 500),
        trial(2, 3, 8, 'large', 'right', 600),
        trial(3, 3, 8, 'small', 'right', 350),
      ],
    })
    expect(result.score).toBe(100)
    expect(result.metrics).toMatchObject({
      accuracy: 1,
      congruentAccuracy: 1,
      incongruentAccuracy: 1,
      timeoutCount: 0,
      validCongruentRtCount: 2,
      validIncongruentRtCount: 2,
    })
    expect(result.metrics.medianRtCongruent).toBe(375)
    expect(result.metrics.medianRtIncongruent).toBe(550)
    expect(result.metrics.sizeCongruityEffectMs).toBe(175)
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(result.qualityFlags.lowAccuracy).toBe(false)
  })

  it('scores wrong responses against the server-derived larger side and flags low accuracy', () => {
    const result = scoreSizecongruityV1({
      config,
      trials: [
        trial(0, 7, 3, 'large', 'right', 400),
        trial(1, 7, 3, 'small', 'right', 500),
        trial(2, 3, 8, 'large', 'left', 600),
        trial(3, 3, 8, 'small', 'left', 350),
      ],
    })
    expect(result.metrics.accuracy).toBe(0)
    expect(result.metrics.congruentAccuracy).toBe(0)
    expect(result.metrics.incongruentAccuracy).toBe(0)
    expect(result.metrics.validCongruentRtCount).toBe(0)
    expect(result.qualityFlags.lowAccuracy).toBe(true)
    expect(result.qualityFlags.insufficientValidCongruentRt).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
    expect(result.score).toBe(0)
  })

  it('uses validRtFloorMs for RT medians only and marks insufficient valid RT when a condition drops below two', () => {
    const result = scoreSizecongruityV1({
      config,
      trials: [
        trial(0, 7, 3, 'large', 'left', 100),
        trial(1, 7, 3, 'large', 'left', 300),
        trial(2, 3, 8, 'large', 'right', 600),
        trial(3, 3, 8, 'large', 'right', 400),
      ],
    })
    expect(result.metrics.accuracy).toBe(1)
    expect(result.metrics.medianRtCongruent).toBe(300)
    expect(result.metrics.medianRtIncongruent).toBe(500)
    expect(result.metrics.sizeCongruityEffectMs).toBe(200)
    expect(result.metrics.validCongruentRtCount).toBe(1)
    expect(result.qualityFlags.insufficientValidCongruentRt).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
    expect(result.qualityFlags.lowAccuracy).toBe(false)
  })

  it('rejects wrong trial counts, gaps and unbalanced conditions', () => {
    expect(() => scoreSizecongruityV1({ config, trials: [trial(0, 7, 3, 'large', 'left', 400)] })).toThrow(CognitiveScoringInputError)
    expect(() => scoreSizecongruityV1({
      config,
      trials: [
        trial(0, 7, 3, 'large', 'left', 400),
        trial(2, 7, 3, 'small', 'left', 500),
        trial(3, 3, 8, 'large', 'right', 600),
        trial(4, 3, 8, 'small', 'right', 350),
      ],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreSizecongruityV1({
      config,
      trials: [
        trial(0, 7, 3, 'large', 'left', 400),
        trial(1, 7, 3, 'large', 'left', 500),
        trial(2, 3, 8, 'small', 'right', 600),
        trial(3, 3, 8, 'small', 'right', 350),
      ],
    })).toThrow(CognitiveScoringInputError)
  })
})
