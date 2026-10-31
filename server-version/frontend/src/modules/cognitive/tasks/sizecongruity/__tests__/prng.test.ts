import { describe, expect, it } from 'vitest'
import { buildSizecongruityTrials, SIZECONGRUITY_PRACTICE_TRIALS } from '../prng'

describe('sizecongruity prng', () => {
  it('produces deterministic trials with the requested condition split', () => {
    const first = buildSizecongruityTrials('seed-1', 10, 0.5, 1, 9, 2)
    const second = buildSizecongruityTrials('seed-1', 10, 0.5, 1, 9, 2)
    expect(first).toEqual(second)
    const congruent = first.filter((t) => (t.leftFontScale === 'large') === (t.leftDigit > t.rightDigit))
    expect(congruent).toHaveLength(5)
  })

  it('keeps digits in range with the required gap and opposite font scales', () => {
    const trials = buildSizecongruityTrials('seed-2', 40, 0.5, 1, 9, 2)
    for (const trial of trials) {
      expect(trial.leftDigit).toBeGreaterThanOrEqual(1)
      expect(trial.leftDigit).toBeLessThanOrEqual(9)
      expect(trial.rightDigit).toBeGreaterThanOrEqual(1)
      expect(trial.rightDigit).toBeLessThanOrEqual(9)
      expect(Math.abs(trial.leftDigit - trial.rightDigit)).toBeGreaterThanOrEqual(2)
      expect(trial.leftFontScale).not.toBe(trial.rightFontScale)
    }
  })

  it('balances the larger digit across left and right positions', () => {
    const trials = buildSizecongruityTrials('seed-3', 40, 0.5, 1, 9, 2)
    const largerOnLeft = trials.filter((t) => t.leftDigit > t.rightDigit).length
    expect(largerOnLeft).toBeGreaterThan(10)
    expect(largerOnLeft).toBeLessThan(30)
  })

  it('changes the sequence when the seed changes and keeps the practice pair fixed', () => {
    expect(buildSizecongruityTrials('seed-a', 10, 0.5, 1, 9, 2)).not.toEqual(buildSizecongruityTrials('seed-b', 10, 0.5, 1, 9, 2))
    expect(SIZECONGRUITY_PRACTICE_TRIALS).toHaveLength(2)
    expect(SIZECONGRUITY_PRACTICE_TRIALS[0].leftFontScale).toBe('large')
    expect(SIZECONGRUITY_PRACTICE_TRIALS[1].leftFontScale).toBe('small')
  })
})
