export interface TimingPerformanceSource {
  readonly timeOrigin: number
  now: () => number
}

export type TimingClockFailureReason =
  | 'performance-unavailable'
  | 'invalid-performance-now'
  | 'invalid-time-origin'

export interface TimingClockSnapshot {
  nowPerfMs: number
  timeOriginEpochMs: number
}

export type TimingClockSnapshotResult =
  | { ok: true; snapshot: TimingClockSnapshot }
  | { ok: false; reason: TimingClockFailureReason }

export type EventTimestampFailureReason =
  | 'invalid-event-timestamp'
  | 'event-timestamp-outside-current-time-origin'

export type EventTimestampValidation =
  | { ok: true; eventPerfMs: number; ageMs: number }
  | { ok: false; reason: EventTimestampFailureReason }

export const DEFAULT_TIMING_DIAGNOSTIC_CAPACITY = 64
export const MAX_TIMING_DIAGNOSTIC_CAPACITY = 128
export const EVENT_TIMESTAMP_FUTURE_TOLERANCE_MS = 8
export const TIME_ORIGIN_EQUALITY_TOLERANCE_MS = 0.5

const defaultPerformanceSource = (): TimingPerformanceSource | null => {
  if (typeof performance === 'undefined') return null
  return performance
}

const isFiniteNonNegative = (value: number): boolean => Number.isFinite(value) && value >= 0

/**
 * Capture the current document's monotonic clock and its epoch anchor.
 *
 * FE-07B deliberately fails closed when either value is unavailable. Callers
 * must not fall back to Date.now() for reaction-time measurement because that
 * would mix clock domains inside one administration.
 */
export const captureTimingClockSnapshot = (
  source: TimingPerformanceSource | null = defaultPerformanceSource(),
): TimingClockSnapshotResult => {
  if (!source) return { ok: false, reason: 'performance-unavailable' }

  const nowPerfMs = source.now()
  if (!isFiniteNonNegative(nowPerfMs)) return { ok: false, reason: 'invalid-performance-now' }
  if (!isFiniteNonNegative(source.timeOrigin)) return { ok: false, reason: 'invalid-time-origin' }

  return {
    ok: true,
    snapshot: {
      nowPerfMs,
      timeOriginEpochMs: source.timeOrigin,
    },
  }
}

/**
 * Exact-document guard used before comparing timestamps captured at different
 * points in one timed trial. A navigation/reload establishes a new time origin
 * and therefore fails this check instead of silently combining clocks.
 */
export const isSameDocumentTimeOrigin = (
  expectedTimeOriginEpochMs: number,
  observedTimeOriginEpochMs: number,
  toleranceMs = TIME_ORIGIN_EQUALITY_TOLERANCE_MS,
): boolean => {
  if (!isFiniteNonNegative(expectedTimeOriginEpochMs) || !isFiniteNonNegative(observedTimeOriginEpochMs)) {
    return false
  }
  if (!Number.isFinite(toleranceMs) || toleranceMs < 0) return false
  return Math.abs(expectedTimeOriginEpochMs - observedTimeOriginEpochMs) <= toleranceMs
}

/**
 * Validate a DOM event timestamp without correcting or re-basing it.
 *
 * Modern DOM event timestamps use the same monotonic time origin as
 * performance.now(). Epoch-like or otherwise future timestamps are rejected;
 * they are never converted by subtracting performance.timeOrigin because that
 * would hide an incompatible browser/runtime clock contract.
 */
export const validateEventTimestamp = (
  eventTimeStamp: number,
  clock: TimingClockSnapshot,
  futureToleranceMs = EVENT_TIMESTAMP_FUTURE_TOLERANCE_MS,
): EventTimestampValidation => {
  if (!isFiniteNonNegative(eventTimeStamp) || !Number.isFinite(futureToleranceMs) || futureToleranceMs < 0) {
    return { ok: false, reason: 'invalid-event-timestamp' }
  }
  if (eventTimeStamp > clock.nowPerfMs + futureToleranceMs) {
    return { ok: false, reason: 'event-timestamp-outside-current-time-origin' }
  }
  return {
    ok: true,
    eventPerfMs: eventTimeStamp,
    ageMs: Math.max(0, clock.nowPerfMs - eventTimeStamp),
  }
}

export type CognitiveTimingDiagnosticCode =
  | 'clock-unavailable'
  | 'time-origin-changed'
  | 'event-timestamp-rejected'
  | 'frame-callback-delay'
  | 'visibility-lost'
  | 'focus-lost'
  | 'pointer-cancelled'

export interface CognitiveTimingDiagnosticInput {
  code: CognitiveTimingDiagnosticCode
  atPerfMs?: number | null
  trialIndex?: number
  deltaMs?: number
}

export interface CognitiveTimingDiagnostic {
  sequence: number
  code: CognitiveTimingDiagnosticCode
  atPerfMs: number | null
  trialIndex?: number
  deltaMs?: number
}

export interface CognitiveTimingDiagnosticBuffer {
  readonly capacity: number
  readonly size: number
  record: (input: CognitiveTimingDiagnosticInput) => CognitiveTimingDiagnostic
  snapshot: () => readonly CognitiveTimingDiagnostic[]
  clear: () => void
}

const normalizeCapacity = (capacity: number): number => {
  if (!Number.isFinite(capacity)) return DEFAULT_TIMING_DIAGNOSTIC_CAPACITY
  return Math.min(MAX_TIMING_DIAGNOSTIC_CAPACITY, Math.max(1, Math.trunc(capacity)))
}

/**
 * In-memory only, fixed-size diagnostics queue.
 *
 * It intentionally exposes no persistence/network hook and accepts only a
 * closed diagnostic code set plus bounded scalar facts. C3-C5 may use this for
 * local evidence, but the queue is not part of task payloads or FINAL data.
 */
export const createCognitiveTimingDiagnosticBuffer = (
  requestedCapacity = DEFAULT_TIMING_DIAGNOSTIC_CAPACITY,
): CognitiveTimingDiagnosticBuffer => {
  const capacity = normalizeCapacity(requestedCapacity)
  const entries: CognitiveTimingDiagnostic[] = []
  let sequence = 0

  return {
    capacity,
    get size() {
      return entries.length
    },
    record(input) {
      sequence += 1
      const trialIndex = input.trialIndex
      const entry: CognitiveTimingDiagnostic = {
        sequence,
        code: input.code,
        atPerfMs: input.atPerfMs != null && isFiniteNonNegative(input.atPerfMs) ? input.atPerfMs : null,
        ...(trialIndex != null && Number.isInteger(trialIndex) && trialIndex >= 0
          ? { trialIndex }
          : {}),
        ...(input.deltaMs != null && Number.isFinite(input.deltaMs)
          ? { deltaMs: input.deltaMs }
          : {}),
      }
      entries.push(Object.freeze(entry))
      if (entries.length > capacity) entries.splice(0, entries.length - capacity)
      return entry
    },
    snapshot() {
      return entries.slice()
    },
    clear() {
      entries.length = 0
    },
  }
}
