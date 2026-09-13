import { describe, expect, it } from 'vitest'
import {
  MAX_TIMING_DIAGNOSTIC_CAPACITY,
  captureTimingClockSnapshot,
  createCognitiveTimingDiagnosticBuffer,
  isSameDocumentTimeOrigin,
  validateEventTimestamp,
} from '../timing'

describe('FE-07B Cognitive timing primitive', () => {
  it('captures one monotonic performance domain without a Date.now fallback', () => {
    const result = captureTimingClockSnapshot({
      timeOrigin: 1_700_000_000_000,
      now: () => 1250.25,
    })

    expect(result).toEqual({
      ok: true,
      snapshot: {
        nowPerfMs: 1250.25,
        timeOriginEpochMs: 1_700_000_000_000,
      },
    })
    expect(captureTimingClockSnapshot(null)).toEqual({ ok: false, reason: 'performance-unavailable' })
    expect(captureTimingClockSnapshot({ timeOrigin: Number.NaN, now: () => 1 })).toEqual({
      ok: false,
      reason: 'invalid-time-origin',
    })
  })

  it('accepts same-domain event timestamps and rejects epoch-like timestamps instead of rebasing them', () => {
    const clock = {
      nowPerfMs: 1000,
      timeOriginEpochMs: 1_700_000_000_000,
    }

    expect(validateEventTimestamp(975, clock)).toEqual({ ok: true, eventPerfMs: 975, ageMs: 25 })
    expect(validateEventTimestamp(1004, clock)).toEqual({ ok: true, eventPerfMs: 1004, ageMs: 0 })
    expect(validateEventTimestamp(1_700_000_001_000, clock)).toEqual({
      ok: false,
      reason: 'event-timestamp-outside-current-time-origin',
    })
    expect(validateEventTimestamp(-1, clock)).toEqual({ ok: false, reason: 'invalid-event-timestamp' })
  })

  it('fails closed when a later sample belongs to a different document time origin', () => {
    expect(isSameDocumentTimeOrigin(1_700_000_000_000, 1_700_000_000_000.25)).toBe(true)
    expect(isSameDocumentTimeOrigin(1_700_000_000_000, 1_700_000_000_010)).toBe(false)
    expect(isSameDocumentTimeOrigin(Number.NaN, 1)).toBe(false)
  })

  it('keeps diagnostics local and bounded by evicting the oldest records', () => {
    const diagnostics = createCognitiveTimingDiagnosticBuffer(2)

    diagnostics.record({ code: 'frame-callback-delay', atPerfMs: 10, trialIndex: 0, deltaMs: 4.5 })
    diagnostics.record({ code: 'visibility-lost', atPerfMs: 20, trialIndex: 0 })
    diagnostics.record({ code: 'event-timestamp-rejected', atPerfMs: 30, trialIndex: 1 })

    expect(diagnostics.capacity).toBe(2)
    expect(diagnostics.size).toBe(2)
    expect(diagnostics.snapshot().map((entry) => entry.code)).toEqual([
      'visibility-lost',
      'event-timestamp-rejected',
    ])
    expect(diagnostics.snapshot().map((entry) => entry.sequence)).toEqual([2, 3])

    diagnostics.clear()
    expect(diagnostics.size).toBe(0)
  })

  it('caps diagnostic capacity and drops invalid optional scalar metadata', () => {
    const diagnostics = createCognitiveTimingDiagnosticBuffer(10_000)
    const entry = diagnostics.record({
      code: 'clock-unavailable',
      atPerfMs: Number.NaN,
      trialIndex: -1,
      deltaMs: Number.POSITIVE_INFINITY,
    })

    expect(diagnostics.capacity).toBe(MAX_TIMING_DIAGNOSTIC_CAPACITY)
    expect(entry).toEqual({ sequence: 1, code: 'clock-unavailable', atPerfMs: null })
  })
})
