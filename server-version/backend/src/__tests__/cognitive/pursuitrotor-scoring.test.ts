import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scorePursuitrotorV1 } from '../../modules/cognitive/scoring/pursuitrotor.v1'
import type { PursuitrotorConfig } from '../../modules/cognitive/schemas/pursuitrotor.config'
import type { PursuitrotorTrial } from '../../modules/cognitive/schemas/pursuitrotor.trial'

const config: PursuitrotorConfig = {
  totalTrials: 2,
  trackMs: 20000,
  revolutionMs: 4000,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, timeOnTargetMs: number, totalTrackMs: number, interrupted = false): { trialIndex: number; payload: PursuitrotorTrial } => ({
  trialIndex: index,
  payload: { trialIndex: index, timeOnTargetMs, totalTrackMs, interrupted },
})

describe('pursuitrotor scorer', () => {
  it('derives on-target rate from client-observed tracking times', () => {
    const result = scorePursuitrotorV1({
      config,
      trials: [trial(0, 12000, 20000), trial(1, 15000, 20000)],
    })
    expect(result.metrics.onTargetRate).toBe(0.675)
    expect(result.metrics.totalTimeOnTargetMs).toBe(27000)
    expect(result.metrics.totalTrackMs).toBe(40000)
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(result.score).toBe(68)
  })

  it('flags low tracking and no tracking', () => {
    const low = scorePursuitrotorV1({
      config,
      trials: [trial(0, 3000, 20000), trial(1, 2000, 20000)],
    })
    expect(low.qualityFlags.lowTracking).toBe(true)
    const none = scorePursuitrotorV1({
      config,
      trials: [trial(0, 0, 0), trial(1, 0, 0)],
    })
    expect(none.qualityFlags.noTracking).toBe(true)
    expect(none.metrics.onTargetRate).toBeNull()
    expect(none.score).toBe(0)
  })

  it('rejects wrong counts and gaps', () => {
    expect(() => scorePursuitrotorV1({ config, trials: [trial(0, 12000, 20000)] })).toThrow(CognitiveScoringInputError)
    expect(() => scorePursuitrotorV1({
      config,
      trials: [trial(0, 12000, 20000), trial(2, 15000, 20000)],
    })).toThrow(CognitiveScoringInputError)
  })
})
