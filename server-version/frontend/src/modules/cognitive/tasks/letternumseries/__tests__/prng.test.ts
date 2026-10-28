import { describe, expect, it } from 'vitest'
import { buildLetternumseriesSequences, LETTERNUMSERIES_PRACTICE_SEQUENCE } from '../prng'

describe('letternumseries prng', () => {
  it('produces deterministic sequences with the exact letter/digit composition', () => {
    const first = buildLetternumseriesSequences('seed-1', 6, 4, 3)
    const second = buildLetternumseriesSequences('seed-1', 6, 4, 3)
    expect(first).toEqual(second)
    for (const trial of first) {
      const letters = trial.sequence.filter((item) => /[A-Za-z]/.test(item))
      const digits = trial.sequence.filter((item) => /[0-9]/.test(item))
      expect(letters).toHaveLength(4)
      expect(digits).toHaveLength(3)
      expect(new Set(letters).size).toBe(4)
      expect(new Set(digits).size).toBe(3)
    }
  })

  it('changes sequences when the seed changes', () => {
    expect(buildLetternumseriesSequences('a', 4, 3, 2)).not.toEqual(buildLetternumseriesSequences('b', 4, 3, 2))
  })

  it('keeps the practice sequence fixed with both kinds (3 letters + 2 digits)', () => {
    expect(LETTERNUMSERIES_PRACTICE_SEQUENCE.filter((item) => /[A-Za-z]/.test(item))).toHaveLength(3)
    expect(LETTERNUMSERIES_PRACTICE_SEQUENCE.filter((item) => /[0-9]/.test(item))).toHaveLength(2)
  })
})
