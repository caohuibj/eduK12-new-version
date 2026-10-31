import { describe, expect, it } from 'vitest'
import { buildNumberlineTargets } from '../prng'

describe('numberline prng', () => {
  it('produces deterministic, in-range, non-endpoint targets for a fixed seed', () => {
    const first = buildNumberlineTargets('seed-1', 8, 100).map((s) => s.targetNumber)
    const second = buildNumberlineTargets('seed-1', 8, 100).map((s) => s.targetNumber)
    expect(first).toEqual(second)
    for (const target of first) {
      expect(target).toBeGreaterThanOrEqual(1)
      expect(target).toBeLessThanOrEqual(99)
      expect(Number.isInteger(target)).toBe(true)
    }
  })

  it('covers both halves of the line for a multi-trial run', () => {
    const targets = buildNumberlineTargets('seed-2', 20, 100).map((s) => s.targetNumber)
    expect(targets.some((target) => target <= 50)).toBe(true)
    expect(targets.some((target) => target > 50)).toBe(true)
  })

  it('changes targets when the seed changes', () => {
    const a = buildNumberlineTargets('seed-a', 8, 100).map((s) => s.targetNumber)
    const b = buildNumberlineTargets('seed-b', 8, 100).map((s) => s.targetNumber)
    expect(a).not.toEqual(b)
  })

  it('supports the extended 0-1000 research range', () => {
    const targets = buildNumberlineTargets('seed-3', 40, 1000).map((s) => s.targetNumber)
    expect(Math.max(...targets)).toBeGreaterThan(500)
    expect(Math.min(...targets)).toBeGreaterThanOrEqual(1)
  })
})
