import type { CognitiveResponseTimestampResult } from './response-timing'
import {
  createCognitiveTimingDiagnosticBuffer,
  type CognitiveTimingDiagnosticBuffer,
  type CognitiveTimingDiagnosticCode,
} from './timing'

export interface TaskTimingDiagnostics {
  readonly buffer: CognitiveTimingDiagnosticBuffer
  frameCallback: (input: { eligiblePerfMs: number; framePerfMs: number; trialIndex: number }) => void
  responseFailure: (input: {
    result: Exclude<CognitiveResponseTimestampResult, { ok: true }>
    eventTimeStamp: number
    trialIndex: number
  }) => void
  visibilityLost: (atPerfMs: number, trialIndex: number) => void
  focusLost: (atPerfMs: number, trialIndex: number) => void
  pointerCancelled: (atPerfMs: number, trialIndex: number) => void
}

const responseFailureCode = (
  reason: Exclude<CognitiveResponseTimestampResult, { ok: true }>['reason'],
): CognitiveTimingDiagnosticCode => {
  if (reason === 'clock-unavailable') return 'clock-unavailable'
  if (reason === 'time-origin-changed') return 'time-origin-changed'
  return 'event-timestamp-rejected'
}

/**
 * Per-mounted-task diagnostics only. No persistence/network/export method is
 * provided; unmounting drops the bounded ring buffer.
 */
export const createTaskTimingDiagnostics = (): TaskTimingDiagnostics => {
  const buffer = createCognitiveTimingDiagnosticBuffer()
  return {
    buffer,
    frameCallback({ eligiblePerfMs, framePerfMs, trialIndex }) {
      buffer.record({
        code: 'frame-callback-delay',
        atPerfMs: framePerfMs,
        trialIndex,
        deltaMs: Math.max(0, framePerfMs - eligiblePerfMs),
      })
    },
    responseFailure({ result, trialIndex }) {
      // Rejected DOM timestamps can be epoch-like or otherwise outside the
      // current monotonic domain. Record only the already-validated monotonic
      // fallback; when the clock itself is unavailable this remains null.
      buffer.record({
        code: responseFailureCode(result.reason),
        atPerfMs: result.fallbackPerfMs,
        trialIndex,
      })
    },
    visibilityLost(atPerfMs, trialIndex) {
      buffer.record({ code: 'visibility-lost', atPerfMs, trialIndex })
    },
    focusLost(atPerfMs, trialIndex) {
      buffer.record({ code: 'focus-lost', atPerfMs, trialIndex })
    },
    pointerCancelled(atPerfMs, trialIndex) {
      buffer.record({ code: 'pointer-cancelled', atPerfMs, trialIndex })
    },
  }
}
