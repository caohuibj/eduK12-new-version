import { describe, expect, it } from 'vitest'
import { deterministicMemorySequence } from '../prng'

describe('Memory seeded sequence plan', () => {
  it('is deterministic, bounded to digits, and keyed by trial/length', () => {
    const first = deterministicMemorySequence('seed-1', 0, 5)
    expect(first).toEqual(deterministicMemorySequence('seed-1', 0, 5))
    expect(first).toHaveLength(5)
    expect(first.every((digit) => digit >= 0 && digit <= 9)).toBe(true)
    expect(first).not.toEqual(deterministicMemorySequence('seed-1', 1, 5))
  })
})
