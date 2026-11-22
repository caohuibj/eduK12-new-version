import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const proc = vi.hoisted(() => ({
  availKiB: 660 * 1024,
  user: 100,
  idle: 900,
  fail: false,
  delay: vi.fn(),
  advanceCpuPercent(pct: number) {
    this.user += Math.round(pct * 10)
    this.idle += Math.round((100 - pct) * 10)
  },
}))

vi.mock('node:timers/promises', () => ({ setTimeout: proc.delay }))

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
  awaitScaleCompositionStartResources,
  isAssessmentStartCpuPaused,
  isAssessmentRunStartCpuPaused,
  withAdmittedScaleCompositionStart,
  reportResourceClaimDecision,
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

  it.each(['false', 'true'])('lets an admitted Scale batch finish a CPU-only trip with trickle=%s', async trickle => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', trickle)
    advanceSample(850, 40)
    expect(await awaitScaleCompositionStartResources()).toBe(true)
    await withAdmittedScaleCompositionStart(async () => {
      for (const cpu of [98, 99]) {
        advanceSample(850, cpu)
        sampleAssessmentHostResources()
        reportResourceClaimDecision(2)
      }
      expect(isAssessmentStartCpuPaused()).toBe(true)
      expect(() => assertAssessmentStartResources()).not.toThrow()
      advanceSample(640, 99)
      expect(() => assertAssessmentStartResources()).toThrow(/系统繁忙/)
    })
    advanceSample(850, 99)
    expect(() => assertAssessmentStartResources()).toThrow(/系统繁忙/)
  })

  it('rechecks a protected Run START at 250ms while retaining the normal two-sample trip', () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')
    sampleAssessmentHostResources()
    advanceSample(850, 99)
    expect(isAssessmentRunStartCpuPaused()).toBe(false)
    advanceSample(850, 99)
    expect(isAssessmentRunStartCpuPaused()).toBe(true)

    clock += 250
    proc.advanceCpuPercent(99)
    expect(isAssessmentRunStartCpuPaused()).toBe(true)
    clock += 250
    proc.advanceCpuPercent(30)
    expect(isAssessmentRunStartCpuPaused()).toBe(false)
    expect(() => assertAssessmentStartResources()).not.toThrow()

    advanceSample(640, 25)
    expect(() => assertAssessmentStartResources()).toThrow(/系统繁忙/)
  })

  it('waits only for CPU pressure to clear and stops waiting after three seconds', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')
    sampleAssessmentHostResources()
    for (const cpu of [98, 99]) {
      advanceSample(850, cpu)
      reportResourceClaimDecision(2)
    }

    proc.delay.mockReset().mockImplementation(async (ms: number) => {
      clock += ms
      proc.advanceCpuPercent(99)
    })
    await expect(awaitScaleCompositionStartResources()).rejects.toMatchObject({
      code: 'INSTRUMENT_NOT_AVAILABLE', statusCode: 503,
    })
    expect(proc.delay.mock.calls.reduce((sum, [ms]) => sum + ms, 0)).toBe(3000)

    proc.delay.mockClear().mockImplementation(async (ms: number) => {
      clock += ms
      proc.advanceCpuPercent(35)
    })
    await expect(awaitScaleCompositionStartResources()).resolves.toBe(true)
    expect(proc.delay).toHaveBeenCalled()
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

  it('revokes ALS trickle permit in finally after normal completion, timer continuations, and error exits', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')

    // 1) Normal return: un-awaited continuation captured inside op must fail closed once op resolves
    let triggerDetachedPromise!: () => void
    let detachedPromise!: Promise<void>
    let detachedTimerPromise!: Promise<void>
    await runWithLowMemoryTrickleAdmission(async () => {
      assertAssessmentStartResources()
      detachedPromise = new Promise<void>(resolve => { triggerDetachedPromise = resolve })
        .then(() => { assertAssessmentStartResources() })
      detachedTimerPromise = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          try {
            assertAssessmentStartResources()
            resolve()
          } catch (err) {
            reject(err)
          }
        }, 25)
      })
      return 'done'
    })

    triggerDetachedPromise()
    await expect(detachedPromise).rejects.toMatchObject({
      code: 'INSTRUMENT_NOT_AVAILABLE',
      statusCode: 503,
      preferredRetryAfterSeconds: 10,
    })
    await expect(detachedTimerPromise).rejects.toMatchObject({
      code: 'INSTRUMENT_NOT_AVAILABLE',
      statusCode: 503,
      preferredRetryAfterSeconds: 10,
    })

    // 2) Exception / rejection: permit revokes AND slot releases for the next request
    let triggerErrContinuation!: () => void
    let errContinuation!: Promise<void>
    await expect(runWithLowMemoryTrickleAdmission(async () => {
      assertAssessmentStartResources()
      errContinuation = new Promise<void>(resolve => { triggerErrContinuation = resolve })
        .then(() => { assertAssessmentStartResources() })
      throw new Error('tx failed')
    })).rejects.toThrow('tx failed')

    triggerErrContinuation()
    await expect(errContinuation).rejects.toMatchObject({
      code: 'INSTRUMENT_NOT_AVAILABLE',
      statusCode: 503,
      preferredRetryAfterSeconds: 10,
    })

    await expect(runWithLowMemoryTrickleAdmission(async () => {
      assertAssessmentStartResources()
      return 'slot-reusable'
    })).resolves.toBe('slot-reusable')
  })

  it('forces live MemAvailable refresh (<1000ms) after queue wait while keeping the 1s CPU delta window intact', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_MAX_CONCURRENT', '1')
    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_MAX_QUEUE', '1')

    // Case A: sub-second memory stay/slight rise (660 -> 665 MiB in +200ms) MUST keep prior 20% CPU rather than zeroing /proc/stat delta to null
    const gateA = deferred<void>()
    let opAEntered = false
    const pA = runWithLowMemoryTrickleAdmission(async () => {
      opAEntered = true
      await gateA.promise
      return 'a'
    })
    await vi.waitFor(() => expect(opAEntered).toBe(true))

    const pB = runWithLowMemoryTrickleAdmission(async () => {
      assertAssessmentStartResources()
      return 'b'
    })

    clock += 200
    proc.availKiB = 665 * 1024
    gateA.resolve()
    await expect(pA).resolves.toBe('a')
    await expect(pB).resolves.toBe('b')

    // Case B: sub-second memory drop (665 -> 649 MiB in +200ms while waiting in queue) MUST fail closed before operation()
    const gateC = deferred<void>()
    let opCEntered = false
    const pC = runWithLowMemoryTrickleAdmission(async () => {
      opCEntered = true
      await gateC.promise
      return 'c'
    })
    await vi.waitFor(() => expect(opCEntered).toBe(true))

    const opD = vi.fn().mockResolvedValue('d')
    const pD = runWithLowMemoryTrickleAdmission(opD)

    clock += 200
    proc.availKiB = 649 * 1024
    gateC.resolve()
    await expect(pC).resolves.toBe('c')
    await expect(pD).rejects.toMatchObject({
      code: 'INSTRUMENT_NOT_AVAILABLE',
      statusCode: 503,
      preferredRetryAfterSeconds: 10,
    })
    expect(opD).not.toHaveBeenCalled()
  })

  it('keeps background reportResourceClaimDecision isolated and rejects unauthorized callers under 700 MiB', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')

    const gate = deferred<void>()
    let entered = false
    const p = runWithLowMemoryTrickleAdmission(async () => {
      entered = true
      await gate.promise
      return 'ok'
    })
    await vi.waitFor(() => expect(entered).toBe(true))

    // Simultaneous un-gated caller (representing anonymous, restart, non-scale-only freeze, or background paths) stays blocked
    expect(() => assertAssessmentStartResources()).toThrow(/系统繁忙/)
    // Claim concurrency telemetry remains limited for <768 MiB and is unaffected by the trickle permit
    expect(reportResourceClaimDecision(4)).toMatchObject({ mode: 'limited', limit: 1, reason: 'memory_headroom' })

    gate.resolve()
    await expect(p).resolves.toBe('ok')
  })

  it('rechecks report CPU recovery without claiming under sustained CPU or changing the memory wait', () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    reportResourceClaimDecision(3)
    advanceSample(950, 98)
    expect(reportResourceClaimDecision(3)).toMatchObject({ mode: 'normal', limit: 3 })
    advanceSample(950, 98)
    const cpuPause = { mode: 'protected', limit: 0, delayMs: 250, reason: 'host_cpu' }
    expect(reportResourceClaimDecision(3)).toMatchObject(cpuPause)
    clock += 249
    proc.advanceCpuPercent(97)
    expect(reportResourceClaimDecision(3)).toMatchObject(cpuPause)
    clock += 1
    expect(reportResourceClaimDecision(3)).toMatchObject(cpuPause)
    clock += 250
    proc.advanceCpuPercent(75)
    expect(reportResourceClaimDecision(3)).toMatchObject({ mode: 'normal', limit: 3, delayMs: 0 })

    advanceSample(500, 30)
    expect(reportResourceClaimDecision(3)).toMatchObject({ mode: 'protected', limit: 0, delayMs: 1000, reason: 'host_memory' })
  })

  it('uses short staggered Retry-After and 250ms CPU recovery probe for low_memory_cpu_busy while keeping <floorMiB at 10s', async () => {
    vi.stubEnv('ASSESSMENT_RESOURCE_PROTECTION_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_LOW_MEMORY_TRICKLE_ENABLED', 'true')
    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_FLOOR_MIB', '512')
    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_RELEASE_MIB', '532')
    vi.stubEnv('ASSESSMENT_START_LOW_MEMORY_MAX_CPU_PERCENT', '90')
    vi.stubEnv('ASSESSMENT_HOST_CPU_RETRY_AFTER_SECONDS', '1')

    // Consume the beforeEach 20% baseline before advancing to 93% CPU
    sampleAssessmentHostResources()
    // MemAvailable=640 MiB (safely above 512 MiB floor) + CPU=93% -> staggered short Retry-After (2..4s), not 10s
    advanceSample(640, 93)
    const retryAfters: number[] = []
    for (let i = 0; i < 3; i += 1) {
      await runWithLowMemoryTrickleAdmission(async () => 'nope').catch(err => {
        retryAfters.push((err as { preferredRetryAfterSeconds?: number }).preferredRetryAfterSeconds ?? -1)
      })
    }
    expect(retryAfters.every(s => s >= 2 && s <= 6)).toBe(true)
    expect(new Set(retryAfters).size).toBeGreaterThan(1)

    // After 250ms, CPU drops to 55% while MemAvailable stays 640 MiB -> recovery probe admits immediately without waiting 1000ms
    clock += 250
    proc.advanceCpuPercent(55)
    await expect(runWithLowMemoryTrickleAdmission(async () => 'recovered')).resolves.toBe('recovered')

    // Below floorMiB (500 MiB) ALWAYS retains strict 10s memory protection
    advanceSample(500, 20)
    await expect(runWithLowMemoryTrickleAdmission(async () => 'nope')).rejects.toMatchObject({
      code: 'INSTRUMENT_NOT_AVAILABLE',
      statusCode: 503,
      preferredRetryAfterSeconds: 10,
    })
  })
})
