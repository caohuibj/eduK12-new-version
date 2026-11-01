import { describe, expect, it } from 'vitest'
import { CognitiveScoringInputError } from '../../modules/cognitive/cognitive.types'
import { scoreGamblingdeckV1 } from '../../modules/cognitive/scoring/gamblingdeck.v1'
import type { GamblingdeckConfig } from '../../modules/cognitive/schemas/gamblingdeck.config'
import type { GamblingdeckDeck, GamblingdeckTrial } from '../../modules/cognitive/schemas/gamblingdeck.trial'

const config: GamblingdeckConfig = {
  totalTrials: 6,
  blockSize: 3,
  fixationMs: 400,
  feedbackMs: 1200,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' },
}

const trial = (index: number, deck: GamblingdeckDeck): { trialIndex: number; payload: GamblingdeckTrial } => ({
  trialIndex: index,
  payload: { deck, rtMs: 500, interrupted: false },
})

describe('gamblingdeck scorer', () => {
  it('derives net results from the pinned schedule and computes advantageous metrics', () => {
    const result = scoreGamblingdeckV1({
      config,
      trials: [trial(0, 'A'), trial(1, 'A'), trial(2, 'B'), trial(3, 'C'), trial(4, 'D'), trial(5, 'C')],
    })
    // A@0=100, A@1=100, B@0=100, C@0=50, D@0=25, C@1=50 → net 425
    expect(result.metrics.netScore).toBe(425)
    expect(result.metrics.advantageousChoiceRate).toBe(0.5)
    expect(result.metrics.deckChoiceRates).toMatchObject({ A: 0.3333, B: 0.1667, C: 0.3333, D: 0.1667 })
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(result.score).toBe(50)
  })

  it('computes a block trend slope across blocks', () => {
    const result = scoreGamblingdeckV1({
      config,
      trials: [trial(0, 'C'), trial(1, 'D'), trial(2, 'C'), trial(3, 'A'), trial(4, 'A'), trial(5, 'A')],
    })
    // block0: C/D/C all advantageous (rate 1); block1: 0
    expect(result.metrics.blockTrendSlope).toBe(-1)
  })

  it('marks interruption without changing derived outcomes', () => {
    const trials = [trial(0, 'A'), trial(1, 'B'), trial(2, 'C'), trial(3, 'D'), trial(4, 'C'), trial(5, 'D')]
    trials[2].payload.interrupted = true
    const result = scoreGamblingdeckV1({ config, trials })
    expect(result.qualityFlags.interrupted).toBe(true)
    expect(result.metrics.netScore).toBe(100 + 100 + 50 + 25 + 50 + 25)
  })

  it('rejects wrong trial counts and gaps', () => {
    expect(() => scoreGamblingdeckV1({ config, trials: [trial(0, 'A')] })).toThrow(CognitiveScoringInputError)
    expect(() => scoreGamblingdeckV1({
      config,
      trials: [trial(0, 'A'), trial(2, 'B'), trial(3, 'C'), trial(4, 'D'), trial(5, 'C'), trial(6, 'D')],
    })).toThrow(CognitiveScoringInputError)
  })
})
