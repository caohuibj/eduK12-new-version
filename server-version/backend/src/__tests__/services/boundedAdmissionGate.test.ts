import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BoundedAdmissionBusyError,
  BoundedAdmissionGate,
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
})
