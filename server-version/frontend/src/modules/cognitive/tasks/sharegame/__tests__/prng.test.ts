import { describe, expect, it } from 'vitest'
import { givenForFraction, SHAREGAME_OPTIONS, SHAREGAME_PRACTICE_ENDOWMENT } from '../prng'

describe('sharegame options', () => {
  it('provides five preset fractions including 0 and 1', () => {
    expect(SHAREGAME_OPTIONS.map((option) => option.fraction)).toEqual([0, 0.25, 0.5, 0.75, 1])
  })

  it('computes integer gives that never exceed the endowment', () => {
    for (const endowment of [20, 50, 100]) {
      for (const option of SHAREGAME_OPTIONS) {
        const given = givenForFraction(endowment, option.fraction)
        expect(given).toBeGreaterThanOrEqual(0)
        expect(given).toBeLessThanOrEqual(endowment)
        expect(Number.isInteger(given)).toBe(true)
      }
    }
    expect(givenForFraction(20, 0.5)).toBe(10)
    expect(givenForFraction(100, 0.75)).toBe(75)
  })

  it('keeps the practice endowment fixed', () => {
    expect(SHAREGAME_PRACTICE_ENDOWMENT).toBe(20)
  })
})
