import { describe, expect, it } from 'vitest'
import { elapsedScaleResponseTimeMs, readScaleTimingNow } from '../response-timing'

describe('Scale response timing', () => {
  it('keeps elapsed response time non-negative and integral', () => {
    expect(elapsedScaleResponseTimeMs(100.25, 250.75)).toBe(151)
    expect(elapsedScaleResponseTimeMs(250, 100)).toBe(0)
    expect(elapsedScaleResponseTimeMs(Number.NaN, 100)).toBe(0)
  })

  it('reads a finite timing clock', () => {
    expect(Number.isFinite(readScaleTimingNow())).toBe(true)
  })
})
