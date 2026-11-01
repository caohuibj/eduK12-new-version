import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreNumberlineV1 } from '../../modules/cognitive/scoring/numberline.v1'
import type { NumberlineConfig } from '../../modules/cognitive/schemas/numberline.config'
import type { NumberlineTrial } from '../../modules/cognitive/schemas/numberline.trial'

const config: NumberlineConfig = {
  totalTrials: 4,
  lineMax: 100,
  maxResponseMs: 10000,
  validRtFloorMs: 300,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, targetNumber: number, responsePosition: number | null, rtMs: number | null): { trialIndex: number; payload: NumberlineTrial } => ({
  trialIndex: index,
  payload: { targetNumber, responsePosition, rtMs, interrupted: false },
})

describe('numberline scorer', () => {
  it('derives PAE, signed bias and within-ten rate from the 0..1 position', () => {
    const result = scoreNumberlineV1({
      config,
      trials: [
        trial(0, 20, 0.35, 900),
        trial(1, 60, 0.5, 800),
        trial(2, 45, 0.5, 300),
        trial(3, 90, 1.0, 850),
      ],
    })
    expect(result.metrics.paePercent).toBe(0.1)
    expect(result.metrics.biasPercent).toBe(0.05)
    expect(result.metrics.withinTenRate).toBe(0.75)
    expect(result.metrics.medianRtMs).toBe(825)
    expect(result.metrics.validTrialCount).toBe(4)
    expect(result.metrics.timeoutCount).toBe(0)
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(result.score).toBe(90)
  })

  it('uses validRtFloorMs to exclude premature responses from RT medians only', () => {
    const result = scoreNumberlineV1({
      config,
      trials: [
        trial(0, 20, 0.35, 100),
        trial(1, 60, 0.5, 500),
        trial(2, 45, 0.5, 400),
        trial(3, 90, 1.0, 800),
      ],
    })
    expect(result.metrics.medianRtMs).toBe(500)
    expect(result.metrics.paePercent).toBe(0.1)
  })

  it('marks quality limits when too many trials time out', () => {
    const timeoutResult = scoreNumberlineV1({
      config,
      trials: [
        trial(0, 20, 0.35, 900),
        trial(1, 60, null, null),
        trial(2, 45, null, null),
        trial(3, 90, null, null),
      ],
    })
    expect(timeoutResult.metrics.paePercent).toBe(0.15)
    expect(timeoutResult.metrics.timeoutCount).toBe(3)
    expect(timeoutResult.qualityFlags.insufficientValidTrials).toBe(true)
    expect(timeoutResult.qualityFlags.excessiveTimeouts).toBe(true)
    expect(timeoutResult.qualityFlags.interpretable).toBe(false)
    expect(timeoutResult.score).toBe(85)
  })

  it('rejects wrong trial counts, gaps and out-of-range targets', () => {
    expect(() => scoreNumberlineV1({ config, trials: [trial(0, 20, 0.2, 900)] })).toThrow(CognitiveScoringInputError)
    expect(() => scoreNumberlineV1({
      config,
      trials: [
        trial(0, 20, 0.2, 900),
        trial(2, 20, 0.2, 900),
        trial(3, 20, 0.2, 900),
        trial(4, 20, 0.2, 900),
      ],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreNumberlineV1({
      config,
      trials: [
        trial(0, 999, 0.2, 900),
        trial(1, 20, 0.2, 900),
        trial(2, 20, 0.2, 900),
        trial(3, 20, 0.2, 900),
      ],
    })).toThrow(CognitiveScoringInputError)
  })
})
