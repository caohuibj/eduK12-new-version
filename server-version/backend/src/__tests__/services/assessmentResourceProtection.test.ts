import { describe, expect, it } from 'vitest'
import { AssessmentResourceProtection, anonymousStartCriticalMemory, isAssessmentStartResourceGateError } from '../../services/assessmentResourceProtection'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
const MiB = 1024 * 1024
const value = (at: number, available = 1500, cpu = 30) => ({ at, availableBytes: available * MiB, cpuPercent: cpu })
describe('bounded background resource protection', () => {
  it('treats less than 650 MiB or an unavailable memory observation as critical for the optional public START precheck', () => {
    expect(anonymousStartCriticalMemory(650 * MiB)).toBe(false)
    expect(anonymousStartCriticalMemory(650 * MiB - 1)).toBe(true)
    expect(anonymousStartCriticalMemory(null)).toBe(true)
    expect(anonymousStartCriticalMemory(Number.NaN)).toBe(true)
  })
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
