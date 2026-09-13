import {
  captureTimingClockSnapshot,
  isSameDocumentTimeOrigin,
  type TimingPerformanceSource,
  validateEventTimestamp,
} from './timing'

export interface CognitiveTimingOnset {
  perfMs: number
  timeOriginEpochMs: number
}

export type CognitiveTimingOnsetResult =
  | { ok: true; onset: CognitiveTimingOnset }
  | { ok: false; reason: 'clock-unavailable' | 'frame-timestamp-rejected' }

export type CognitiveResponseTimestampResult =
  | { ok: true; responsePerfMs: number; rtMs: number; eventAgeMs: number }
  | {
      ok: false
      reason: 'clock-unavailable' | 'time-origin-changed' | 'event-timestamp-rejected' | 'event-before-onset'
      fallbackPerfMs: number | null
    }

/**
 * Bind a frame callback timestamp to the current document time origin.
 * The frame timestamp is kept as the software onset reference; performance.now
 * is sampled only to validate that it belongs to the same current clock domain.
 */
export const captureFrameTimingOnset = (
  framePerfMs: number,
  source?: TimingPerformanceSource | null,
): CognitiveTimingOnsetResult => {
  const clock = captureTimingClockSnapshot(source)
  if (!clock.ok) return { ok: false, reason: 'clock-unavailable' }
  const validated = validateEventTimestamp(framePerfMs, clock.snapshot)
  if (!validated.ok) return { ok: false, reason: 'frame-timestamp-rejected' }
  return {
    ok: true,
    onset: {
      perfMs: framePerfMs,
      timeOriginEpochMs: clock.snapshot.timeOriginEpochMs,
    },
  }
}

/**
 * Resolve one browser input event against a previously captured software onset.
 *
 * This function never estimates device/dispatch latency and never rebases an
 * epoch-like timestamp. Invalid timestamps fail closed; callers may preserve
 * usability with fallbackPerfMs, but must mark that response as degraded.
 */
export const resolveEventResponseTimestamp = (
  eventTimeStamp: number,
  onset: CognitiveTimingOnset,
  source?: TimingPerformanceSource | null,
): CognitiveResponseTimestampResult => {
  const clock = captureTimingClockSnapshot(source)
  if (!clock.ok) {
    return { ok: false, reason: 'clock-unavailable', fallbackPerfMs: null }
  }
  if (!isSameDocumentTimeOrigin(onset.timeOriginEpochMs, clock.snapshot.timeOriginEpochMs)) {
    return { ok: false, reason: 'time-origin-changed', fallbackPerfMs: clock.snapshot.nowPerfMs }
  }
  const validated = validateEventTimestamp(eventTimeStamp, clock.snapshot)
  if (!validated.ok) {
    return { ok: false, reason: 'event-timestamp-rejected', fallbackPerfMs: clock.snapshot.nowPerfMs }
  }
  if (validated.eventPerfMs < onset.perfMs) {
    return { ok: false, reason: 'event-before-onset', fallbackPerfMs: clock.snapshot.nowPerfMs }
  }
  return {
    ok: true,
    responsePerfMs: validated.eventPerfMs,
    rtMs: validated.eventPerfMs - onset.perfMs,
    eventAgeMs: validated.ageMs,
  }
}
