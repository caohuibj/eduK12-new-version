import { describe, expect, it } from 'vitest'
import { captureFrameTimingOnset, resolveEventResponseTimestamp } from '../response-timing'

describe('FE-07B response timestamp validation', () => {
  it('computes RT from same-document event timestamps without latency correction', () => {
    const source = { timeOrigin: 1_700_000_000_000, now: () => 1320 }
    const onset = captureFrameTimingOnset(1000, source)
    expect(onset.ok).toBe(true)
    if (!onset.ok) return

    expect(resolveEventResponseTimestamp(1275, onset.onset, source)).toEqual({
      ok: true,
      responsePerfMs: 1275,
      rtMs: 275,
      eventAgeMs: 45,
    })
  })

  it('rejects a changed document time origin and exposes only current monotonic fallback', () => {
    const onset = { perfMs: 1000, timeOriginEpochMs: 1_700_000_000_000 }
    expect(resolveEventResponseTimestamp(1200, onset, {
      timeOrigin: 1_700_000_100_000,
      now: () => 1300,
    })).toEqual({
      ok: false,
      reason: 'time-origin-changed',
      fallbackPerfMs: 1300,
    })
  })

  it('rejects epoch-like and pre-onset event timestamps instead of rebasing them', () => {
    const onset = { perfMs: 1000, timeOriginEpochMs: 1_700_000_000_000 }
    const source = { timeOrigin: 1_700_000_000_000, now: () => 1400 }

    expect(resolveEventResponseTimestamp(1_700_000_001_300, onset, source)).toEqual({
      ok: false,
      reason: 'event-timestamp-rejected',
      fallbackPerfMs: 1400,
    })
    expect(resolveEventResponseTimestamp(900, onset, source)).toEqual({
      ok: false,
      reason: 'event-before-onset',
      fallbackPerfMs: 1400,
    })
  })

  it('fails closed if the monotonic clock is unavailable', () => {
    const onset = { perfMs: 1000, timeOriginEpochMs: 1_700_000_000_000 }
    expect(resolveEventResponseTimestamp(1200, onset, null)).toEqual({
      ok: false,
      reason: 'clock-unavailable',
      fallbackPerfMs: null,
    })
  })
})
