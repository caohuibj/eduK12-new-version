import { describe, expect, it } from 'vitest'
import { evaluateQuality, isReactionTimeWithinBounds } from '../../modules/cognitive/quality/quality-rules'

describe('cognitive quality rules', () => {
  it('shares reaction-time bounds across scorers', () => {
    const rules = { minReactionTimeMs: 100, maxReactionTimeMs: 2000 }
    expect(isReactionTimeWithinBounds(100, rules)).toBe(true)
    expect(isReactionTimeWithinBounds(50, rules)).toBe(false)
    expect(isReactionTimeWithinBounds(2001, rules)).toBe(false)
  })

  it('deduplicates rule reasons and applies the missing-trial threshold', () => {
    expect(evaluateQuality(
      { reactionTimes: [50, 50, 2500], missingTrials: 3 },
      { minReactionTimeMs: 100, maxReactionTimeMs: 2000, maxMissingTrials: 2 }
    )).toEqual({
      interpretable: false,
      reasons: [
        'reaction_time_below_floor',
        'reaction_time_timeout',
        'too_many_missing_trials',
      ],
    })
  })
})
