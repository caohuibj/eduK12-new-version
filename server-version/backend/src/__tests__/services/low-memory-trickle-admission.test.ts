import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const proc = vi.hoisted(() => ({
  availKiB: 660 * 1024,
  user: 100,
  idle: 900,
  fail: false,
  advanceCpuPercent(pct: number) {
    this.user += Math.round(pct * 10)
    this.idle += Math.round((100 - pct) * 10)
  },
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: ((path: unknown, ...args: unknown[]) => {
      if (path === '/proc/meminfo') {
        if (proc.fail) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        return `MemAvailable: ${proc.availKiB} kB\n`
      }
      if (path === '/proc/stat') {
        if (proc.fail) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        return `cpu  ${proc.user} 0 0 ${proc.idle} 0 0 0 0\n`
      }
      return (actual.readFileSync as (...params: unknown[]) => unknown)(path, ...args)
    }) as typeof actual.readFileSync,
  }
})

import {
  assertAssessmentStartResources,
  resetAssessmentResourceProtectionForTests,
  runWithLowMemoryTrickleAdmission,
  sampleAssessmentHostResources,
} from '../../services/assessmentResourceProtection'

const deferred = <T>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

describe('runWithLowMemoryTrickleAdmission runtime gate & ALS permit', () => {
  let clock = 1000
  let nowSpy: ReturnType<typeof vi.spyOn>

  const advanceSample = (availMiB: number, cpuPercent: number) => {
    clock += 1500
    proc.availKiB = availMiB * 1024
    proc.advanceCpuPercent(cpuPercent)
  }

  beforeEach(() => {
    clock = 1000
    proc.availKiB = 720 * 1024
    proc.user = 100
    proc.idle = 900
    proc.fail = false
    resetAssessmentResourceProtectionForTests()
    nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock)
    // Prime baseline /proc/stat delta so the next sample computes CPU%
    sampleAssessmentHostResources()
    advanceSample(660, 20)
  })

  afterEach(() => {
    nowSpy.mockRestore()
    vi.unstubAllEnvs()
    resetAssessmentResourceProtectionForTests()
  })

  it('keeps strict <700 MiB rejection when ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED is unset', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    const op = vi.fn().mockResolvedValue('ok')

    await expect(runWithLowMemoryTrickleAdmission(op)).rejects.toMatchObject({
      code: 'INSTRUMENT_NOT_AVAILABLE',
      statusCode: 503,
      preferredRetryAfterSeconds: 10,
    })
    expect(op).not.toHaveBeenCalled()
  })

  it('fails closed when procfs telemetry is unavailable even with trickle enabled', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')
    clock += 1500
    proc.fail = true
    const op = vi.fn().mockResolvedValue('ok')

    await expect(runWithLowMemoryTrickleAdmission(op)).rejects.toMatchObject({
      code: 'INSTRUMENT_NOT_AVAILABLE',
      statusCode: 503,
      preferredRetryAfterSeconds: 10,
    })
    expect(op).not.toHaveBeenCalled()
  })

  it('bounds concurrent low-memory STARTs, isolates ALS trickle permits, and rejects queue overflow before operation', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT', '1')
    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_MAX_QUEUE', '1')
    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_MAX_WAIT_MS', '2000')

    const gate1 = deferred<void>()
    const started: string[] = []

    const p1 = runWithLowMemoryTrickleAdmission(async () => {
      started.push('op1')
      // Inside-TX runtime guard sees the explicit ALS trickle permit and passes
      assertAssessmentStartResources()
      await gate1.promise
      return 'r1'
    })

    // Wait a microtask so p1 acquires the gate slot and blocks inside op1
    await vi.waitFor(() => expect(started).toEqual(['op1']))

    // Un-gated caller in [650, 700) must still fail closed even while p1 holds a permit
    expect(() => assertAssessmentStartResources()).toThrow(/系统繁忙/)

    const p2 = runWithLowMemoryTrickleAdmission(async () => {
      started.push('op2')
      assertAssessmentStartResources()
      return 'r2'
    })
    const p3 = runWithLowMemoryTrickleAdmission(async () => {
      started.push('op3')
      return 'r3'
    })

    // p3 exceeds maxConcurrent=1 + maxQueue=1 and fails fast without calling op3
    await expect(p3).rejects.toMatchObject({
      code: 'INSTRUMENT_NOT_AVAILABLE',
      statusCode: 503,
      preferredRetryAfterSeconds: 10,
    })
    expect(started).toEqual(['op1'])

    gate1.resolve()
    await expect(p1).resolves.toBe('r1')
    await expect(p2).resolves.toBe('r2')
    expect(started).toEqual(['op1', 'op2'])
  })

  it('re-checks fresh telemetry after waiting in the trickle queue and aborts if memory drops below floor', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT', '1')
    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_MAX_QUEUE', '1')

    const gate1 = deferred<void>()
    let op1Entered = false
    const p1 = runWithLowMemoryTrickleAdmission(async () => {
      op1Entered = true
      await gate1.promise
      return 'r1'
    })

    await vi.waitFor(() => expect(op1Entered).toBe(true))

    const op2 = vi.fn().mockResolvedValue('r2')
    const p2 = runWithLowMemoryTrickleAdmission(op2)

    // While p2 waits in queue, host drops below floorMiB=650
    advanceSample(645, 20)
    gate1.resolve()

    await expect(p1).resolves.toBe('r1')
    await expect(p2).rejects.toMatchObject({
      code: 'INSTRUMENT_NOT_AVAILABLE',
      statusCode: 503,
      preferredRetryAfterSeconds: 10,
    })
    expect(op2).not.toHaveBeenCalled()
  })

  it('supports maxConcurrent=0 to disable trickle on secondary instances while still allowing >=700 MiB', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT', '0')

    const opTrickle = vi.fn().mockResolvedValue('nope')
    await expect(runWithLowMemoryTrickleAdmission(opTrickle)).rejects.toMatchObject({
      code: 'INSTRUMENT_NOT_AVAILABLE',
      statusCode: 503,
      preferredRetryAfterSeconds: 10,
    })
    expect(opTrickle).not.toHaveBeenCalled()

    advanceSample(705, 30)
    const opNormal = vi.fn().mockResolvedValue('normal-ok')
    await expect(runWithLowMemoryTrickleAdmission(opNormal)).resolves.toBe('normal-ok')
    expect(opNormal).toHaveBeenCalledTimes(1)
  })
})
