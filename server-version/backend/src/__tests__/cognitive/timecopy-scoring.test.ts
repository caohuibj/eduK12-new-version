import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreTimecopyV1 } from '../../modules/cognitive/scoring/timecopy.v1'
import type { TimecopyConfig } from '../../modules/cognitive/schemas/timecopy.config'
import type { TimecopyTrial } from '../../modules/cognitive/schemas/timecopy.trial'

const config: TimecopyConfig = {
  totalTrials: 4,
  targetMinMs: 1000,
  targetMaxMs: 3000,
  maxResponseMs: 10000,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, targetMs: number, responseMs: number, interrupted = false): { trialIndex: number; payload: TimecopyTrial } => ({
  trialIndex: index,
  payload: { targetMs, responseMs, interrupted },
})

describe('timecopy scorer', () => {
  it('derives relative error, signed bias and the within-twenty rate', () => {
    const result = scoreTimecopyV1({
      config,
      trials: [
        trial(0, 1000, 1200),
        trial(1, 2000, 1800),
        trial(2, 3000, 3000),
        trial(3, 1000, 800),
      ],
    })
    // ratios: +0.2, -0.1, 0, -0.2 → abs mean 0.125, bias +0.2-0.1+0-0.2=-0.1/4=-0.025
    expect(result.metrics.meanAbsErrorRatio).toBe(0.125)
    expect(result.metrics.biasRatio).toBe(-0.025)
    expect(result.metrics.withinTwentyRate).toBe(1)
    expect(result.metrics.medianReproductionMs).toBe(1500)
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(result.score).toBe(88)
  })

  it('excludes interrupted trials from the statistics', () => {
    const result = scoreTimecopyV1({
      config,
      trials: [
        trial(0, 1000, 1200),
        trial(1, 2000, 1800, true),
        trial(2, 3000, 3000),
        trial(3, 1000, 1000),
      ],
    })
    expect(result.metrics.meanAbsErrorRatio).toBe(0.0667)
    expect(result.metrics.medianReproductionMs).toBe(1200)
    expect(result.qualityFlags.interrupted).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(true)
  })

  it('flags excessive deviation and empty responses', () => {
    const excessive = scoreTimecopyV1({
      config,
      trials: [trial(0, 1000, 2100), trial(1, 1000, 2200), trial(2, 1000, 2300), trial(3, 1000, 2400)],
    })
    expect(excessive.metrics.meanAbsErrorRatio).toBe(1.25)
    expect(excessive.qualityFlags.excessiveDeviation).toBe(true)
    expect(excessive.qualityFlags.interpretable).toBe(false)
    expect(excessive.score).toBe(0)
  })

  it('rejects out-of-range targets and wrong counts', () => {
    expect(() => scoreTimecopyV1({
      config,
      trials: [trial(0, 500, 600), trial(1, 2000, 2000), trial(2, 3000, 3000), trial(3, 1000, 1000)],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreTimecopyV1({ config, trials: [trial(0, 1000, 1200)] })).toThrow(CognitiveScoringInputError)
  })
})
