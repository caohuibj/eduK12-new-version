import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  anonymousStartDiagnosticEnabled,
  recordRequestPhase,
  requestObservabilityMiddleware,
  resetRuntimeObservabilityForTests,
  runtimeMetricLines,
} from '../../services/runtimeObservability'

const metricText = () => runtimeMetricLines().join('\n')

const ROUTINE_PHASES = [
  'anonymous.start.pre_gate_ms',
  'anonymous.start.gate_wait_ms',
  'anonymous.start.gate_slot_ms',
  'anonymous.start.tx_wall_ms',
  'anonymous.start.post_gate_ms',
] as const

const DIAGNOSTIC_PHASES = [
  'anonymous.start.composite_for_update_query_ms',
  'anonymous.start.composite_for_update_query_failed_ms',
  'anonymous.start.tx_acquisition_wait_ms',
  'anonymous.start.tx_acquisition_failed_ms',
] as const

/** Run work inside a request observation, then finalize the response so the
 * recorded phases are observed into the phase histogram. Mirrors the
 * runtimeObservability.test.ts pattern. */
const runInObservation = async (path: string, work: () => Promise<void> | void): Promise<void> => {
  const response = Object.assign(new EventEmitter(), { statusCode: 200 }) as any
  const request = { method: 'POST', path, baseUrl: '', route: undefined } as any
  let workPromise: Promise<void> | undefined
  requestObservabilityMiddleware(request, response, () => {
    workPromise = Promise.resolve(work())
  })
  await workPromise
  response.emit('finish')
}

describe('anonymous START observability (two-tier)', () => {
  beforeEach(() => {
    resetRuntimeObservabilityForTests()
    delete process.env.ANONYMOUS_START_DIAGNOSTIC_ENABLED
  })

  it('records the five routine phase timers into the phase histogram', async () => {
    // The path carries a realistic wave id; the route label must be the
    // normalized template, never the raw id.
    await runInObservation('/api/public/anonymous-studies/waves/abc123def456/start', async () => {
      const start = process.hrtime.bigint()
      for (const phase of ROUTINE_PHASES) {
        recordRequestPhase(phase, 12, start, start)
      }
    })
    const metrics = metricText()
    for (const phase of ROUTINE_PHASES) {
      expect(metrics).toMatch(
        new RegExp(`ptool_assessment_phase_duration_seconds_count\\{phase="${phase.replace(/\./g, '\\.')}",route="[^"]+"\\} 1`),
      )
    }
    expect(metrics).not.toContain('abc123def456')
  })

  it('keeps phase labels low-cardinality: fixed names only, no identifiers', async () => {
    await runInObservation('/api/public/anonymous-studies/waves/abc123def456/start', async () => {
      const start = process.hrtime.bigint()
      for (const phase of [...ROUTINE_PHASES, ...DIAGNOSTIC_PHASES]) {
        recordRequestPhase(phase, 1, start, start)
      }
    })
    const metrics = metricText()
    // The only anonymous.start.* label values are the seven fixed phase names.
    // (Each phase renders once per histogram bucket, so dedupe first.)
    const labelValues = [...new Set([...metrics.matchAll(/phase="(anonymous\.start\.[^"]+)"/g)].map((m) => m[1]))]
    expect(labelValues.sort()).toEqual([...ROUTINE_PHASES, ...DIAGNOSTIC_PHASES].sort())
    expect(metrics).not.toContain('abc123def456')
    expect(metrics).not.toContain('attempt-')
  })

  it('diagnostic flag defaults off and enables only on the exact string "true"', () => {
    expect(anonymousStartDiagnosticEnabled()).toBe(false)
    process.env.ANONYMOUS_START_DIAGNOSTIC_ENABLED = 'true'
    expect(anonymousStartDiagnosticEnabled()).toBe(true)
    process.env.ANONYMOUS_START_DIAGNOSTIC_ENABLED = '1'
    expect(anonymousStartDiagnosticEnabled()).toBe(false)
    process.env.ANONYMOUS_START_DIAGNOSTIC_ENABLED = 'false'
    expect(anonymousStartDiagnosticEnabled()).toBe(false)
    process.env.ANONYMOUS_START_DIAGNOSTIC_ENABLED = ''
    expect(anonymousStartDiagnosticEnabled()).toBe(false)
  })

  it('records diagnostic phases only when the diagnostic flag is on', async () => {
    // Flag off (default): diagnostic phases are not recorded.
    await runInObservation('/api/public/anonymous-studies/waves/abc123def456/start', async () => {
      const start = process.hrtime.bigint()
      if (anonymousStartDiagnosticEnabled()) {
        recordRequestPhase('anonymous.start.composite_for_update_query_ms', 5, start, start)
        recordRequestPhase('anonymous.start.tx_acquisition_wait_ms', 3, start, start)
      }
    })
    let metrics = metricText()
    expect(metrics).not.toContain('anonymous.start.composite_for_update_query_ms')
    expect(metrics).not.toContain('anonymous.start.tx_acquisition_wait_ms')

    // Flag on: diagnostic phases are recorded.
    resetRuntimeObservabilityForTests()
    process.env.ANONYMOUS_START_DIAGNOSTIC_ENABLED = 'true'
    await runInObservation('/api/public/anonymous-studies/waves/abc123def456/start', async () => {
      const start = process.hrtime.bigint()
      if (anonymousStartDiagnosticEnabled()) {
        recordRequestPhase('anonymous.start.composite_for_update_query_ms', 5, start, start)
        recordRequestPhase('anonymous.start.tx_acquisition_wait_ms', 3, start, start)
      }
    })
    metrics = metricText()
    expect(metrics).toMatch(
      /ptool_assessment_phase_duration_seconds_count\{phase="anonymous\.start\.composite_for_update_query_ms",route="[^"]+"\} 1/,
    )
    expect(metrics).toMatch(
      /ptool_assessment_phase_duration_seconds_count\{phase="anonymous\.start\.tx_acquisition_wait_ms",route="[^"]+"\} 1/,
    )
  })
  it('adds precise 2.5–4.5s buckets only for anonymous START phases', async () => {
    await runInObservation('/api/public/anonymous-studies/waves/abc123def456/start', () => {
      const stamp = process.hrtime.bigint()
      recordRequestPhase('anonymous.start.gate_slot_ms', 3_200, stamp, stamp)
      recordRequestPhase('response', 3_200, stamp, stamp)
    })
    const metrics = metricText(), route = '/api/:unmatched'
    expect(metrics).toContain(`ptool_assessment_phase_duration_seconds_bucket{phase="anonymous.start.gate_slot_ms",route="${route}",le="3"} 0`)
    expect(metrics).toContain(`ptool_assessment_phase_duration_seconds_bucket{phase="anonymous.start.gate_slot_ms",route="${route}",le="3.5"} 1`)
    expect(metrics).not.toContain(`ptool_assessment_phase_duration_seconds_bucket{phase="response",route="${route}",le="3.5"}`)
  })
})
