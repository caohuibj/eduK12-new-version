import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreSharegameV1 } from '../../modules/cognitive/scoring/sharegame.v1'
import type { SharegameConfig } from '../../modules/cognitive/schemas/sharegame.config'
import type { SharegameTrial } from '../../modules/cognitive/schemas/sharegame.trial'

const config: SharegameConfig = {
  endowments: [20, 50, 100],
  fixationMs: 400,
  timeoutMs: 20000,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, endowment: number, given: number, rtMs = 500): { trialIndex: number; payload: SharegameTrial } => ({
  trialIndex: index,
  payload: { endowment, given, rtMs, interrupted: false },
})

describe('sharegame scorer', () => {
  it('derives the giving rate, equal splits and consistency', () => {
    const result = scoreSharegameV1({
      config,
      trials: [trial(0, 20, 10), trial(1, 50, 25), trial(2, 100, 50)],
    })
    expect(result.metrics.givingRate).toBe(0.5)
    expect(result.metrics.equalSplitCount).toBe(3)
    expect(result.metrics.generousRate).toBe(1)
    expect(result.metrics.givingRateSd).toBe(0)
    expect(result.metrics.medianDecisionMs).toBe(500)
    expect(result.qualityFlags.interpretable).toBe(true)
  })

  it('suppresses the product index for this descriptive preference task', () => {
    const result = scoreSharegameV1({
      config,
      trials: [trial(0, 20, 0), trial(1, 50, 50), trial(2, 100, 100)],
    })
    expect(result.showProductIndex).toBe(false)
    expect(result.metrics.givingRate).toBe(0.8824)
    expect(result.metrics.givingRateSd).toBeGreaterThan(0)
  })

  it('rejects mismatched endowments, over-giving and wrong counts', () => {
    expect(() => scoreSharegameV1({
      config,
      trials: [trial(0, 50, 10), trial(1, 50, 25), trial(2, 100, 50)],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreSharegameV1({
      config,
      trials: [trial(0, 20, 30), trial(1, 50, 25), trial(2, 100, 50)],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreSharegameV1({ config, trials: [trial(0, 20, 10)] })).toThrow(CognitiveScoringInputError)
  })
})
