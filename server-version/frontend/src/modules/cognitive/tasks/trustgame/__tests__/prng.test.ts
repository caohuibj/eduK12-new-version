import { describe, expect, it } from 'vitest'
import { TRUSTGAME_PRACTICE_OFFER, TRUSTGAME_PRACTICE_POT } from '../prng'

describe('trustgame practice constants', () => {
  it('keeps the practice offer unfair and inside the pot', () => {
    expect(TRUSTGAME_PRACTICE_OFFER).toBe(20)
    expect(TRUSTGAME_PRACTICE_OFFER).toBeLessThan(TRUSTGAME_PRACTICE_POT)
    expect(TRUSTGAME_PRACTICE_OFFER * 2).toBeLessThan(TRUSTGAME_PRACTICE_POT)
  })
})
