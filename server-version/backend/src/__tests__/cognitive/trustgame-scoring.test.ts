import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreTrustgameV1 } from '../../modules/cognitive/scoring/trustgame.v1'
import type { TrustgameConfig } from '../../modules/cognitive/schemas/trustgame.config'
import type { TrustgameTrial } from '../../modules/cognitive/schemas/trustgame.trial'

const config: TrustgameConfig = {
  offers: [50, 20, 80, 10],
  potTotal: 100,
  fixationMs: 400,
  timeoutMs: 20000,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, response: 'accept' | 'reject' | null, rtMs: number | null = 500, offerToSelf?: number): { trialIndex: number; payload: TrustgameTrial } => ({
  trialIndex: index,
  payload: { roundIndex: index, offerToSelf: offerToSelf ?? config.offers[index], response, rtMs, interrupted: false },
})

describe('trustgame scorer', () => {
  it('classifies fair/unfair offers server-side and computes acceptance rates', () => {
    const result = scoreTrustgameV1({
      config,
      trials: [trial(0, 'accept'), trial(1, 'reject'), trial(2, 'accept'), trial(3, 'reject')],
    })
    // fair: 50, 80; unfair: 20, 10
    expect(result.metrics.acceptanceRate).toBe(0.5)
    expect(result.metrics.unfairAcceptanceRate).toBe(0)
    expect(result.metrics.rejectedUnfairCount).toBe(2)
    expect(result.metrics.fairOfferCount).toBe(2)
    expect(result.metrics.medianDecisionMs).toBe(500)
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(result.showProductIndex).toBe(false)
  })

  it('flags no-response submissions', () => {
    const result = scoreTrustgameV1({
      config,
      trials: [trial(0, null, null), trial(1, null, null), trial(2, null, null), trial(3, null, null)],
    })
    expect(result.metrics.acceptanceRate).toBeNull()
    expect(result.qualityFlags.noResponses).toBe(true)
    expect(result.qualityFlags.interpretable).toBe(false)
    expect(result.score).toBe(0)
  })

  it('rejects offer mismatches, wrong counts and gaps', () => {
    expect(() => scoreTrustgameV1({
      config,
      trials: [trial(0, 'accept', 500, 30), trial(1, 'reject'), trial(2, 'accept'), trial(3, 'reject')],
    })).toThrow(CognitiveScoringInputError)
    expect(() => scoreTrustgameV1({ config, trials: [trial(0, 'accept')] })).toThrow(CognitiveScoringInputError)
    expect(() => scoreTrustgameV1({
      config,
      trials: [trial(0, 'accept'), trial(2, 'reject'), trial(3, 'accept'), trial(4, 'reject')],
    })).toThrow(CognitiveScoringInputError)
  })
})
