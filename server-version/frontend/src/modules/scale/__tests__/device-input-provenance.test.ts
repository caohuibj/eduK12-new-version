import { describe, expect, it } from 'vitest'
import {
  captureScaleDeviceInputProvenance,
  inferDeviceInputProvenance,
  isDeviceInputProvenanceV1,
  readScaleDeviceInputProvenance,
  resolveScaleDeviceInputProvenance,
} from '../device-input-provenance'

describe('Scale device input provenance capture', () => {
  it('classifies common desktop and mobile signals without retaining the raw user agent', () => {
    const desktop = inferDeviceInputProvenance({
      userAgent: 'Mozilla/5.0 Windows NT 10.0 Win64 x64 AppleWebKit Chrome/120.0',
      platform: 'Win32',
      viewportWidth: 1280,
      viewportHeight: 720,
      screenWidth: 1920,
      screenHeight: 1080,
      devicePixelRatio: 1,
      maxTouchPoints: 0,
      primaryFinePointer: true,
    }, '2026-09-08T00:00:00.000Z')
    expect(desktop).toMatchObject({ deviceClass: 'DESKTOP', osFamily: 'Windows', browserFamily: 'Chrome', primaryPointer: 'FINE' })
    expect(desktop).not.toHaveProperty('userAgent')

    const mobile = inferDeviceInputProvenance({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17.0 Mobile Safari/604.1',
      platform: 'iPhone',
      viewportWidth: 390,
      viewportHeight: 844,
      screenWidth: 390,
      screenHeight: 844,
      devicePixelRatio: 3,
      maxTouchPoints: 5,
      primaryCoarsePointer: true,
    }, '2026-09-08T00:00:00.000Z')
    expect(mobile).toMatchObject({ deviceClass: 'MOBILE', osFamily: 'iOS', browserFamily: 'Safari', primaryPointer: 'COARSE' })
  })

  it('keeps ambiguous signals UNKNOWN and validates metadata strictly', () => {
    const unknown = inferDeviceInputProvenance({}, '2026-09-08T00:00:00.000Z')
    expect(unknown).toMatchObject({ deviceClass: 'UNKNOWN', osFamily: 'Unknown', browserFamily: 'Unknown', primaryPointer: 'UNKNOWN' })
    expect(isDeviceInputProvenanceV1(unknown)).toBe(true)
    expect(isDeviceInputProvenanceV1({ ...unknown, rawUa: 'Mozilla/5.0' })).toBe(false)
    expect(readScaleDeviceInputProvenance({ scaleDeviceInputProvenance: unknown })).toEqual(unknown)
    expect(readScaleDeviceInputProvenance({ scaleDeviceInputProvenance: { ...unknown, capturedAt: 'not-a-date' } })).toBeNull()
  })

  it('resolves stored or server provenance before capturing a new snapshot', () => {
    const stored = inferDeviceInputProvenance({}, '2026-09-08T00:00:00.000Z')
    const server = inferDeviceInputProvenance({}, '2026-09-08T00:01:00.000Z')
    expect(resolveScaleDeviceInputProvenance({ metadata: { scaleDeviceInputProvenance: stored }, serverValue: server })).toBe(stored)
    expect(resolveScaleDeviceInputProvenance({ serverValue: server })).toBe(server)
    expect(resolveScaleDeviceInputProvenance({ existing: stored })).toBe(stored)
  })

  it('captures a validated snapshot in browser or server-like environments', () => {
    const captured = captureScaleDeviceInputProvenance()
    expect(isDeviceInputProvenanceV1(captured)).toBe(true)
  })
})
