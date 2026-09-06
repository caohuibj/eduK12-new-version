import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BoundedAdmissionBusyError,
  BoundedAdmissionGate,
  configuredInteger,
} from '../../services/boundedAdmissionGate'
import {
  resetRuntimeObservabilityForTests,
  runtimeMetricLines,
} from '../../services/runtimeObservability'

const nextTick = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('BoundedAdmissionGate', () => {
  afterEach(() => {
    vi.useRealTimers()
    resetRuntimeObservabilityForTests()
  })

  it('limits concurrent work, queues FIFO, and publishes labelled gauges', async () => {
    const gate = new BoundedAdmissionGate({
      name: 'unit_submit',
      maxConcurrent: 1,
      maxQueue: 2,
      maxWaitMs: 1_000,
      retryAfterSeconds: 1,
      busyCode: 'ASSESSMENT_SUBMIT_BUSY',
    })
    const order: string[] = []
    let releaseFirst!: () => void

    const first = gate.run(() => new Promise<string>((resolve) => {
      releaseFirst = () => {
        order.push('first')
        resolve('first')
      }
    }))
    const second = gate.run(async () => {
      order.push('second')
      return 'second'
    })
    const third = gate.run(async () => {
      order.push('third')
      return 'third'
    })

    await nextTick()
    expect(gate.getStats()).toMatchObject({ active: 1, queued: 2 })
    const metrics = runtimeMetricLines().join('\n')
    expect(metrics).toContain('ptool_bounded_admission_active{gate="unit_submit"} 1')
    expect(metrics).toContain('ptool_bounded_admission_queue{gate="unit_submit"} 2')

    releaseFirst()
    await expect(Promise.all([first, second, third])).resolves.toEqual(['first', 'second', 'third'])
    expect(order).toEqual(['first', 'second', 'third'])
    expect(gate.getStats()).toMatchObject({ active: 0, queued: 0 })
  })

  it('rejects with Retry-After metadata when the bounded queue is full', async () => {
    const gate = new BoundedAdmissionGate({
      name: 'aggregate_finalization',
      maxConcurrent: 1,
      maxQueue: 0,
      maxWaitMs: 1_000,
      retryAfterSeconds: 3,
      busyCode: 'AGGREGATE_BUSY',
      busyMessage: '聚合繁忙',
    })
    let releaseFirst!: () => void
    const first = gate.run(() => new Promise<void>((resolve) => {
      releaseFirst = resolve
    }))
    const rejected = gate.run(async () => 'nope')

    await expect(rejected).rejects.toMatchObject({
      code: 'AGGREGATE_BUSY',
      reason: 'queue_full',
      retryAfterSeconds: 3,
      gate: 'aggregate_finalization',
    })
    await expect(rejected).rejects.toBeInstanceOf(BoundedAdmissionBusyError)
    expect(runtimeMetricLines().join('\n')).toContain(
      'ptool_bounded_admission_rejections_total{gate="aggregate_finalization",reason="queue_full"} 1',
    )

    releaseFirst()
    await expect(first).resolves.toBeUndefined()
  })

  it('expires queued work without consuming a later slot', async () => {
    vi.useFakeTimers()
    const gate = new BoundedAdmissionGate({
      name: 'timeout_gate',
      maxConcurrent: 1,
      maxQueue: 1,
      maxWaitMs: 20,
      retryAfterSeconds: 1,
    })
    let releaseFirst!: () => void
    const first = gate.run(() => new Promise<void>((resolve) => {
      releaseFirst = resolve
    }))
    const queued = gate.run(async () => 'queued')
    const queuedOutcome = queued.then(
      () => ({ kind: 'resolved' as const }),
      (error) => ({ kind: 'rejected' as const, error }),
    )

    await vi.advanceTimersByTimeAsync(21)
    const outcome = await queuedOutcome
    expect(outcome).toMatchObject({
      kind: 'rejected',
      error: { code: 'ADMISSION_BUSY', reason: 'timeout', gate: 'timeout_gate' },
    })
    expect(gate.getStats()).toMatchObject({ active: 1, queued: 0 })

    releaseFirst()
    await expect(first).resolves.toBeUndefined()
    await expect(gate.run(async () => 'usable')).resolves.toBe('usable')
  })
  
  it.each([
    { raw: undefined, allowZero: false, expected: 7 },
    { raw: '', allowZero: false, expected: 7 },
    { raw: '4', allowZero: false, expected: 4 },
    { raw: '0', allowZero: true, expected: 0 },
  ])('uses the fallback only for unset/empty admission env and parses valid integers', ({
    raw,
    allowZero,
    expected,
  }) => {
    const name = 'TEST_ADMISSION_VALUE'
    const previous = process.env[name]
    if (raw === undefined) delete process.env[name]
    else process.env[name] = raw
    try {
      expect(configuredInteger(name, 7, allowZero)).toBe(expected)
    } finally {
      if (previous === undefined) delete process.env[name]
      else process.env[name] = previous
    }
  })

  it.each(['0', '-1', '4.5', 'abc', 'NaN', 'Infinity'])(
    'rejects explicit invalid admission value %s',
    (raw) => {
      const name = 'TEST_ADMISSION_INVALID'
      const previous = process.env[name]
      process.env[name] = raw
      try {
        expect(() => configuredInteger(name, 7)).toThrow(/TEST_ADMISSION_INVALID/)
      } finally {
        if (previous === undefined) delete process.env[name]
        else process.env[name] = previous
      }
    },
  )

  it('accepts explicit zero only when allowZero is enabled', () => {
    const name = 'TEST_ADMISSION_ZERO'
    const previous = process.env[name]
    process.env[name] = '0'
    try {
      expect(() => configuredInteger(name, 7)).toThrow()
      expect(configuredInteger(name, 7, true)).toBe(0)
    } finally {
      if (previous === undefined) delete process.env[name]
      else process.env[name] = previous
    }
  })

})
