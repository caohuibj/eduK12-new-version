import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreArithverifyV1 } from '../../modules/cognitive/scoring/arithverify.v1'
import type { ArithverifyConfig } from '../../modules/cognitive/schemas/arithverify.config'
import type { ArithverifyTrial } from '../../modules/cognitive/schemas/arithverify.trial'

const config: ArithverifyConfig = {
  totalTrials: 4,
  operandMax: 10,
  trueRatio: 0.5,
  fixationMs: 500,
  timeoutMs: 6000,
  validRtFloorMs: 200,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (
  index: number,
  leftOperand: number,
  rightOperand: number,
  displayedResult: number,
  response: boolean | null,
  rtMs: number | null
): { trialIndex: number; payload: ArithverifyTrial } => ({
  trialIndex: index,
  payload: { leftOperand, rightOperand, displayedResult, response, rtMs, interrupted: false },
})

describe('arithverify scorer', () => {
  it('derives equation truth server-side and computes the frozen metrics', () => {
    const result = scoreArithverifyV1({
      config,
      trials: [
        trial(0, 3, 4, 7, true, 400),
        trial(1, 6, 2, 9, false, 500),
        trial(2, 5, 5, 11, false, 600),
        trial(3, 7, 1, 8, true, 300),
      ],
    })
    expect(result.score).toBe(100)
    expect(result.metrics).toMatchObject({
      accuracy: 1,
      errorCount: 0,
      timeoutCount: 0,
      validRtCount: 4,
    })
    expect(result.metrics.medianRtMs).toBe(450)
    expect(result.metrics.problemSizeSlopeMs).not.toBeNull()
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(result.qualityFlags.lowAccuracy).toBe(false)
  })

  it('scores a wrong response against the server-derived truth and flags low accuracy', () => {
    const result = scoreArithverifyV1({
      config,
      trials: [
        trial(0, 3, 4, 7, false, 400),
        trial(1, 6, 2, 9, true, 500),
        trial(2, 5, 5, 11, false, 600),
        trial(3, 7, 1, 8, false, 300),
      ],
    })
    expect(result.metrics.accuracy).toBe(0.25)
    expect(result.metrics.errorCount).toBe(3)
    expect(result.qualityFlags.lowAccuracy).toBe(true)
    expect(result.qualityFlags.insufficientValidRt).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
    expect(result.score).toBe(25)
  })

  it('excludes premature responses from RT statistics but not accuracy', () => {
    const result = scoreArithverifyV1({
      config,
      trials: [
        trial(0, 3, 4, 7, true, 100),
        trial(1, 6, 2, 9, false, 500),
        trial(2, 5, 5, 11, false, 600),
        trial(3, 7, 1, 8, true, 400),
      ],
    })
    expect(result.metrics.accuracy).toBe(1)
    expect(result.metrics.medianRtMs).toBe(500)
    expect(result.metrics.validRtCount).toBe(3)
  })

  it('rejects wrong trial counts, gaps and unbalanced true/false splits', () => {
    expect(() => scoreArithverifyV1({ config, trials: [trial(0, 3, 4, 7, true, 400)] })).toThrow(CognitiveScoringInputError)
    expect(() => scoreArithverifyV1({
      config,
      trials: [
        trial(0, 3, 4, 7, true, 400),
        trial(2, 6, 2, 9, false, 500),
        trial(3, 5, 5, 11, false, 600),
        trial(4, 7, 1, 8, true, 300),
      ],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreArithverifyV1({
      config,
      trials: [
        trial(0, 3, 4, 7, true, 400),
        trial(1, 6, 2, 8, true, 500),
        trial(2, 5, 5, 10, true, 600),
        trial(3, 7, 1, 9, false, 300),
      ],
    })).toThrow(CognitiveScoringInputError)
  })
})
