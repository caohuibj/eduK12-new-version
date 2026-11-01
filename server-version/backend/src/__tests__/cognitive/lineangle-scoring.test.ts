import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreLineangleV1 } from '../../modules/cognitive/scoring/lineangle.v1'
import type { LineangleConfig } from '../../modules/cognitive/schemas/lineangle.config'
import type { LineangleTrial } from '../../modules/cognitive/schemas/lineangle.trial'

const config: LineangleConfig = {
  totalTrials: 4,
  angleStepDeg: 15,
  optionCount: 3,
  minAngleSepSteps: 2,
  fixationMs: 500,
  timeoutMs: 8000,
  validRtFloorMs: 300,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, targetAngle: number, optionAngles: number[], responseAngle: number | null, rtMs: number | null): { trialIndex: number; payload: LineangleTrial } => ({
  trialIndex: index,
  payload: { targetAngle, optionAngles, responseAngle, rtMs, interrupted: false },
})

describe('lineangle scorer', () => {
  it('derives correctness against the target angle and computes the frozen metrics', () => {
    const result = scoreLineangleV1({
      config,
      trials: [
        trial(0, 60, [30, 60, 120], 60, 400),
        trial(1, 90, [45, 90, 135], 45, 500),
        trial(2, 30, [30, 90, 150], 30, 600),
        trial(3, 120, [60, 105, 120], 120, 350),
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
  })

  it('flags low accuracy and insufficient valid RT', () => {
    const result = scoreLineangleV1({
      config,
      trials: [
        trial(0, 60, [30, 60, 120], 30, 400),
        trial(1, 90, [45, 90, 135], 45, 500),
        trial(2, 30, [30, 90, 150], 90, 600),
        trial(3, 120, [60, 105, 120], 60, 350),
      ],
    })
    expect(result.metrics.accuracy).toBe(0)
    expect(result.metrics.validRtCount).toBe(0)
    expect(result.qualityFlags.lowAccuracy).toBe(true)
    expect(result.qualityFlags.insufficientValidRt).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
    expect(result.score).toBe(0)
  })

  it('rejects missing targets, duplicate options and foreign responses', () => {
    expect(() => scoreLineangleV1({
      config,
      trials: [
        trial(0, 60, [30, 90, 120], 30, 400),
        trial(1, 90, [45, 90, 135], 90, 500),
        trial(2, 30, [30, 90, 150], 30, 600),
        trial(3, 120, [60, 105, 120], 120, 350),
      ],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreLineangleV1({
      config,
      trials: [
        trial(0, 60, [60, 60, 120], 60, 400),
        trial(1, 90, [45, 90, 135], 90, 500),
        trial(2, 30, [30, 90, 150], 30, 600),
        trial(3, 120, [60, 105, 120], 120, 350),
      ],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreLineangleV1({
      config,
      trials: [
        trial(0, 60, [30, 60, 120], 30, 400),
        trial(1, 90, [45, 90, 135], 90, 500),
        trial(2, 30, [30, 90, 150], 30, 600),
        trial(3, 120, [60, 105, 120], 15, 350),
      ],
    })).toThrow(CognitiveScoringInputError)
  })
})
