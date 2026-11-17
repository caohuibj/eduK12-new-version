import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AssessmentResourceProtection,
  anonymousStartCriticalMemory,
  configuredLowMemoryTrickleConfig,
  configuredMemoryRetryAfterSeconds,
  isAssessmentStartResourceGateError,
  resetAssessmentResourceProtectionForTests,
  runWithLowMemoryTrickleAdmission,
} from '../../services/assessmentResourceProtection'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
const MiB = 1024 * 1024
const value = (at: number, available = 1500, cpu: number | null = 30) => ({ at, availableBytes: available * MiB, cpuPercent: cpu })
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
  it('releases the CPU latch at 90% but not at 91%, without changing the 95% trip point', () => {
    const p = new AssessmentResourceProtection()
    expect(p.decision(value(0, 1500, 95), 2, 0).limit).toBe(2)
    expect(p.decision(value(1000, 1500, 96), 2, 1000).limit).toBe(0)
    expect(p.decision(value(2000, 1500, 91), 2, 2000).limit).toBe(0)
    expect(p.decision(value(3000, 1500, 90), 2, 3000).limit).toBe(2)
    expect(p.decision(value(4000, 1500, 94), 2, 4000).limit).toBe(2)
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

describe('low-memory START trickle configuration and state machine', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetAssessmentResourceProtectionForTests()
  })

  it('provides conservative defaults and derives releaseMiB from floorMiB when unset', () => {
    expect(configuredLowMemoryTrickleConfig()).toEqual({
      floorMiB: 650,
      releaseMiB: 670,
      maxCpuPercent: 80,
      maxConcurrent: 1,
      maxQueue: 1,
      maxWaitMs: 2000,
    })

    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_FLOOR_MIB', '690')
    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT', '0')
    expect(configuredLowMemoryTrickleConfig()).toMatchObject({
      floorMiB: 690,
      releaseMiB: 700,
      maxConcurrent: 0,
    })
  })

  it('validates bounds for all trickle configuration variables', () => {
    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_FLOOR_MIB', '511')
    expect(() => configuredLowMemoryTrickleConfig()).toThrow(/FLOOR_MIB/)
    vi.unstubAllEnvs()

    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_FLOOR_MIB', '700')
    expect(() => configuredLowMemoryTrickleConfig()).toThrow(/FLOOR_MIB/)
    vi.unstubAllEnvs()

    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_FLOOR_MIB', '660')
    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_RELEASE_MIB', '659')
    expect(() => configuredLowMemoryTrickleConfig()).toThrow(/RELEASE_MIB/)
    vi.unstubAllEnvs()

    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_RELEASE_MIB', '701')
    expect(() => configuredLowMemoryTrickleConfig()).toThrow(/RELEASE_MIB/)
    vi.unstubAllEnvs()

    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_MAX_CPU_PERCENT', '95')
    expect(() => configuredLowMemoryTrickleConfig()).toThrow(/MAX_CPU_PERCENT/)
    vi.unstubAllEnvs()

    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT', '11')
    expect(() => configuredLowMemoryTrickleConfig()).toThrow(/MAX_CONCURRENT/)
    vi.unstubAllEnvs()

    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_MAX_QUEUE', '21')
    expect(() => configuredLowMemoryTrickleConfig()).toThrow(/MAX_QUEUE/)
    vi.unstubAllEnvs()

    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_MAX_WAIT_MS', '99')
    expect(() => configuredLowMemoryTrickleConfig()).toThrow(/MAX_WAIT_MS/)
  })

  it('enforces hysteresis across floor and release thresholds and crisis latch up to 700 MiB', () => {
    const p = new AssessmentResourceProtection()
    const cfg = configuredLowMemoryTrickleConfig()

    expect(p.startAdmissionDecision(value(0, 700, 90), 0, cfg)).toEqual({ action: 'allow', reason: null, retryHint: null })
    expect(p.startAdmissionDecision(value(1000, 660, 20), 1000, cfg)).toEqual({
      action: 'trickle',
      reason: 'low_memory_trickle',
      retryHint: null,
    })

    // Dropping below 650 latches trickle rejection until >= 670
    expect(p.startAdmissionDecision(value(2000, 649, 10), 2000, cfg)).toMatchObject({
      action: 'reject_memory',
      reason: 'host_memory',
      retryHint: 'memory',
    })
    expect(p.startAdmissionDecision(value(3000, 669, 10), 3000, cfg)).toMatchObject({
      action: 'reject_memory',
      reason: 'host_memory',
    })
    expect(p.startAdmissionDecision(value(4000, 670, 10), 4000, cfg)).toEqual({
      action: 'trickle',
      reason: 'low_memory_trickle',
      retryHint: null,
    })

    // Crisis latch (< 512 MiB) keeps rejecting until >= 700 MiB even above releaseMiB
    expect(p.startAdmissionDecision(value(5000, 500, 10), 5000, cfg)).toMatchObject({ action: 'reject_memory', reason: 'host_memory' })
    expect(p.startAdmissionDecision(value(6000, 680, 10), 6000, cfg)).toMatchObject({ action: 'reject_memory', reason: 'host_memory' })
    expect(p.startAdmissionDecision(value(7000, 700, 10), 7000, cfg)).toEqual({ action: 'allow', reason: null, retryHint: null })
  })

  it('rejects trickle when CPU is busy, unavailable, latched high, or telemetry is stale/missing', () => {
    const p = new AssessmentResourceProtection()
    const cfg = configuredLowMemoryTrickleConfig()

    expect(p.startAdmissionDecision(value(0, 660, 80), 0, cfg).action).toBe('trickle')
    expect(p.startAdmissionDecision(value(1000, 660, 81), 1000, cfg)).toMatchObject({
      action: 'reject_memory',
      reason: 'low_memory_cpu_busy',
      retryHint: 'memory',
    })
    expect(p.startAdmissionDecision(value(2000, 660, null), 2000, cfg)).toMatchObject({
      action: 'reject_memory',
      reason: 'cpu_observation_unavailable',
      retryHint: 'memory',
    })
    expect(p.startAdmissionDecision({ at: 3000, availableBytes: null, cpuPercent: 10 }, 3000, cfg)).toMatchObject({
      action: 'reject_memory',
      reason: 'observation_unavailable',
    })
    expect(p.startAdmissionDecision(value(3000, 750, 10), 9000, cfg)).toMatchObject({
      action: 'reject_memory',
      reason: 'observation_unavailable',
    })

    p.reset()
    expect(p.startAdmissionDecision(value(0, 750, 96), 0, cfg).action).toBe('allow')
    // Memory-only refresh carrying the same cpuAt timestamp must not double-count a single high-CPU sample
    expect(p.startAdmissionDecision({ at: 200, cpuAt: 0, availableBytes: 660 * MiB, cpuPercent: 96 }, 200, cfg)).toMatchObject({
      action: 'reject_memory',
      reason: 'low_memory_cpu_busy',
    })
    expect(p.startAdmissionDecision(value(1000, 750, 80), 1000, cfg).action).toBe('allow')
    expect(p.startAdmissionDecision(value(2000, 750, 96), 2000, cfg).action).toBe('allow')
    expect(p.startAdmissionDecision(value(3000, 750, 96), 3000, cfg)).toEqual({
      action: 'reject_cpu',
      reason: 'host_cpu',
      retryHint: 'cpu',
    })
  })

  it('bypasses host sampling completely when resource protection is disabled', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'false')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')
    const operation = vi.fn().mockResolvedValue('ok')
    await expect(runWithLowMemoryTrickleAdmission(operation)).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(1)
  })
})
