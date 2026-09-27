import { describe, expect, it } from 'vitest'
import { MAX_PUBLIC_LINK_TTL_MS, publicAccessExpiryWithinPolicy } from '../../services/publicAccessPolicy'

describe('public access expiry policy', () => {
  it('accepts a future link within one year and rejects past or overlong capabilities', () => {
    const now = Date.UTC(2026, 8, 27)
    expect(publicAccessExpiryWithinPolicy(new Date(now + 60_000), { now })).toBe(true)
    expect(publicAccessExpiryWithinPolicy(new Date(now - 1), { now })).toBe(false)
    expect(publicAccessExpiryWithinPolicy(new Date(now + MAX_PUBLIC_LINK_TTL_MS + 1), { now })).toBe(false)
  })

  it('also honors a product-specific upper bound without changing the global ceiling', () => {
    const now = Date.UTC(2026, 8, 27)
    const upperBound = new Date(now + 86_400_000)
    expect(publicAccessExpiryWithinPolicy(new Date(now + 3_600_000), { now, upperBound })).toBe(true)
    expect(publicAccessExpiryWithinPolicy(new Date(now + 2 * 86_400_000), { now, upperBound })).toBe(false)
  })
})
