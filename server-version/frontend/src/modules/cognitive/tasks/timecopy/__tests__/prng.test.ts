import { describe, expect, it } from 'vitest'
import { buildTimecopyTargets } from '../prng'

describe('timecopy prng', () => {
  it('produces deterministic in-range targets for a fixed seed', () => {
    const first = buildTimecopyTargets('seed-1', 8, 1000, 3000)
    const second = buildTimecopyTargets('seed-1', 8, 1000, 3000)
    expect(first).toEqual(second)
    for (const trial of first) {
      expect(trial.targetMs).toBeGreaterThanOrEqual(1000)
      expect(trial.targetMs).toBeLessThanOrEqual(3000)
      expect(Number.isInteger(trial.targetMs)).toBe(true)
    }
  })

  it('spreads targets across the range', () => {
    const targets = buildTimecopyTargets('seed-2', 10, 1000, 3000).map((trial) => trial.targetMs)
    expect(Math.min(...targets)).toBeLessThan(2000)
    expect(Math.max(...targets)).toBeGreaterThan(2000)
  })

  it('changes targets when the seed changes', () => {
    expect(buildTimecopyTargets('a', 6, 1000, 3000)).not.toEqual(buildTimecopyTargets('b', 6, 1000, 3000))
  })
})
