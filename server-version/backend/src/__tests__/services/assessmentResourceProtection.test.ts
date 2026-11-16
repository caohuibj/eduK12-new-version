import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssessmentResourceProtection, isAssessmentStartResourceGateError, configuredMemoryRetryAfterSeconds } from '../../services/assessmentResourceProtection'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
const MiB = 1024 * 1024
const value = (at: number, available = 1500, cpu = 30) => ({ at, availableBytes: available * MiB, cpuPercent: cpu })
describe('memory retry hint configuration', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('defaults to ten seconds and accepts the bounded endpoints', () => {
    vi.stubEnv('ASSESSMENT_HOST_MEMORY_RETRY_AFTER_SECONDS', '')
    expect(configuredMemoryRetryAfterSeconds()).toBe(10)
    for (const n of [1, 8, 60]) {
      vi.stubEnv('ASSESSMENT_HOST_MEMORY_RETRY_AFTER_SECONDS', String(n))
      expect(configuredMemoryRetryAfterSeconds()).toBe(n)
    }
  })
  it.each(['0', '-1', '61', '1.5', 'NaN', 'Infinity'])('rejects invalid value %s', raw => {
    vi.stubEnv('ASSESSMENT_HOST_MEMORY_RETRY_AFTER_SECONDS', raw)
    expect(() => configuredMemoryRetryAfterSeconds()).toThrow()
  })
})

describe('bounded background resource protection', () => {
  it('only treats a typed 503 INSTRUMENT_NOT_AVAILABLE as a precompute fail-fast', () => {
    expect(isAssessmentStartResourceGateError(
      new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', 'busy', 503)
    )).toBe(true)
    expect(isAssessmentStartResourceGateError(
      new InstrumentFinalSubmitError('STALE_ATTEMPT', 'busy', 503)
    )).toBe(false)
    expect(isAssessmentStartResourceGateError(
      new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', 'unavailable', 404)
    )).toBe(false)
    expect(isAssessmentStartResourceGateError(
      Object.assign(new Error('transient failure'), { statusCode: 503 })
    )).toBe(false)
    expect(isAssessmentStartResourceGateError(
      { code: 'INSTRUMENT_NOT_AVAILABLE', statusCode: 503 }
    )).toBe(false)
  })

  it('keeps the normal work-conserving path free of artificial claim delay', () => {
    expect(new AssessmentResourceProtection().decision(value(0), 2, 0)).toMatchObject({ mode: 'normal', limit: 2, delayMs: 0 })
  })
  it('only pauses new claims under critical memory and resumes with hysteresis', () => {
    const p = new AssessmentResourceProtection()
    expect(p.decision(value(0, 500), 2, 0)).toMatchObject({ mode: 'protected', limit: 0 })
    expect(p.decision(value(1000, 600), 2, 1000).limit).toBe(0)
    expect(p.decision(value(2000, 710), 2, 2000)).toMatchObject({ mode: 'limited', limit: 1, delayMs: 0 })
    expect(p.decision(value(3000, 900), 2, 3000).limit).toBe(2)
  })
  it('requires distinct high CPU samples, recovers, and never permanently blocks on stale telemetry', () => {
    const p = new AssessmentResourceProtection()
    expect(p.decision(value(0, 1500, 98), 2, 0).limit).toBe(2)
    expect(p.decision(value(0, 1500, 98), 2, 0).limit).toBe(2)
    expect(p.decision(value(1000, 1500, 98), 2, 1000).limit).toBe(0)
    expect(p.decision({ at: 1500, availableBytes: 1500 * MiB, cpuPercent: null }, 2, 1500)).toMatchObject({ mode: 'limited', limit: 1, delayMs: 0 })
    expect(p.decision(value(2000, 1500, 80), 2, 2000).limit).toBe(2)
    expect(p.decision(value(2000), 2, 8000)).toMatchObject({ mode: 'limited', limit: 1, reason: 'observation_unavailable' })
  })
})
