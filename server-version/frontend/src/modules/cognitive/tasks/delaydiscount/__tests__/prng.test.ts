import { describe, expect, it } from 'vitest'
import { buildDelaydiscountBandOrder, immediateForBounds, DELAYDISCOUNT_PRACTICE_TRIAL } from '../prng'

describe('delaydiscount prng', () => {
  it('produces a deterministic band order covering all bands', () => {
    const first = buildDelaydiscountBandOrder('seed-1', 3)
    const second = buildDelaydiscountBandOrder('seed-1', 3)
    expect(first).toEqual(second)
    expect([...first].sort()).toEqual([0, 1, 2])
  })

  it('changes the band order when the seed changes', () => {
    const orders = new Set([0, 1, 2].map((suffix) => buildDelaydiscountBandOrder(`seed-${suffix}`, 3).join('')))
    expect(orders.size).toBeGreaterThan(1)
  })

  it('computes bisection midpoints consistently with the scorer rule', () => {
    expect(immediateForBounds(0, 100)).toBe(50)
    expect(immediateForBounds(50, 100)).toBe(75)
    expect(immediateForBounds(75, 100)).toBe(88)
    expect(immediateForBounds(25, 50)).toBe(38)
  })

  it('keeps the practice trial fixed', () => {
    expect(DELAYDISCOUNT_PRACTICE_TRIAL).toMatchObject({ delayDays: 7, delayedAmount: 100, immediateAmount: 50 })
  })
})
