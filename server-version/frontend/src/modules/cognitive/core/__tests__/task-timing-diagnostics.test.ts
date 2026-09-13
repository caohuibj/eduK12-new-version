import { describe, expect, it } from 'vitest'
import { createTaskTimingDiagnostics } from '../task-timing-diagnostics'

describe('FE-07B task-local timing diagnostics', () => {
  it('records frame delay and task quality context without changing timing values', () => {
    const diagnostics = createTaskTimingDiagnostics()

    diagnostics.frameCallback({ eligiblePerfMs: 100, framePerfMs: 116.5, trialIndex: 2 })
    diagnostics.visibilityLost(120, 2)
    diagnostics.focusLost(121, 2)
    diagnostics.pointerCancelled(122, 2)

    expect(diagnostics.buffer.snapshot()).toEqual([
      { sequence: 1, code: 'frame-callback-delay', atPerfMs: 116.5, trialIndex: 2, deltaMs: 16.5 },
      { sequence: 2, code: 'visibility-lost', atPerfMs: 120, trialIndex: 2 },
      { sequence: 3, code: 'focus-lost', atPerfMs: 121, trialIndex: 2 },
      { sequence: 4, code: 'pointer-cancelled', atPerfMs: 122, trialIndex: 2 },
    ])
  })

  it('maps response timestamp failures to the closed diagnostic code set', () => {
    const diagnostics = createTaskTimingDiagnostics()

    diagnostics.responseFailure({
      result: { ok: false, reason: 'clock-unavailable', fallbackPerfMs: null },
      eventTimeStamp: 10,
      trialIndex: 0,
    })
    diagnostics.responseFailure({
      result: { ok: false, reason: 'time-origin-changed', fallbackPerfMs: 20 },
      eventTimeStamp: 20,
      trialIndex: 1,
    })
    diagnostics.responseFailure({
      result: { ok: false, reason: 'event-before-onset', fallbackPerfMs: 30 },
      eventTimeStamp: 30,
      trialIndex: 2,
    })

    expect(diagnostics.buffer.snapshot().map((entry) => entry.code)).toEqual([
      'clock-unavailable',
      'time-origin-changed',
      'event-timestamp-rejected',
    ])
  })

  it('remains bounded because the underlying ring buffer evicts oldest diagnostics', () => {
    const diagnostics = createTaskTimingDiagnostics()

    for (let trialIndex = 0; trialIndex < 80; trialIndex += 1) {
      diagnostics.visibilityLost(trialIndex, trialIndex)
    }

    const snapshot = diagnostics.buffer.snapshot()
    expect(snapshot).toHaveLength(64)
    expect(snapshot[0]?.sequence).toBe(17)
    expect(snapshot.at(-1)?.sequence).toBe(80)
  })
})
