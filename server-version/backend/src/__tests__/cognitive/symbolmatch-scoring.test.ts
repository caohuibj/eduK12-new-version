import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreSymbolmatchV1 } from '../../modules/cognitive/scoring/symbolmatch.v1'
import type { SymbolmatchConfig } from '../../modules/cognitive/schemas/symbolmatch.config'
import type { SymbolmatchTrial } from '../../modules/cognitive/schemas/symbolmatch.trial'

const config: SymbolmatchConfig = {
  totalTrials: 4,
  symbolDigitMap: [['●', 1], ['■', 2], ['▲', 3], ['◆', 4], ['★', 5]],
  fixationMs: 400,
  timeoutMs: 8000,
  validRtFloorMs: 250,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, symbol: string, response: number | null, rtMs: number | null): { trialIndex: number; payload: SymbolmatchTrial } => ({
  trialIndex: index,
  payload: { symbol, response, rtMs, interrupted: false },
})

describe('symbolmatch scorer', () => {
  it('derives correctness from the frozen map and computes the frozen metrics', () => {
    const result = scoreSymbolmatchV1({
      config,
      trials: [
        trial(0, '●', 1, 400),
        trial(1, '★', 5, 500),
        trial(2, '■', 3, 600),
        trial(3, '▲', 3, 350),
      ],
    })
    expect(result.score).toBe(75)
    expect(result.metrics).toMatchObject({
      accuracy: 0.75,
      errorCount: 1,
      timeoutCount: 0,
      validRtCount: 3,
    })
    expect(result.metrics.medianRtMs).toBe(400)
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(result.qualityFlags.lowAccuracy).toBe(false)
  })

  it('flags low accuracy and insufficient valid RT', () => {
    const result = scoreSymbolmatchV1({
      config,
      trials: [
        trial(0, '●', 2, 400),
        trial(1, '★', 4, 500),
        trial(2, '■', 1, 600),
        trial(3, '▲', 5, 350),
      ],
    })
    expect(result.metrics.accuracy).toBe(0)
    expect(result.qualityFlags.lowAccuracy).toBe(true)
    expect(result.qualityFlags.insufficientValidRt).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
    expect(result.score).toBe(0)
  })

  it('excludes premature responses from RT medians only', () => {
    const result = scoreSymbolmatchV1({
      config,
      trials: [
        trial(0, '●', 1, 100),
        trial(1, '★', 5, 500),
        trial(2, '■', 2, 600),
        trial(3, '▲', 3, 700),
      ],
    })
    expect(result.metrics.accuracy).toBe(1)
    expect(result.metrics.medianRtMs).toBe(600)
    expect(result.metrics.validRtCount).toBe(3)
  })

  it('rejects wrong trial counts, gaps and unknown symbols', () => {
    expect(() => scoreSymbolmatchV1({ config, trials: [trial(0, '●', 1, 400)] })).toThrow(CognitiveScoringInputError)
    expect(() => scoreSymbolmatchV1({
      config,
      trials: [
        trial(0, '●', 1, 400),
        trial(2, '★', 5, 500),
        trial(3, '■', 2, 600),
        trial(4, '▲', 3, 350),
      ],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreSymbolmatchV1({
      config,
      trials: [
        trial(0, '♀', 1, 400),
        trial(1, '★', 5, 500),
        trial(2, '■', 2, 600),
        trial(3, '▲', 3, 350),
      ],
    })).toThrow(CognitiveScoringInputError)
  })
})
