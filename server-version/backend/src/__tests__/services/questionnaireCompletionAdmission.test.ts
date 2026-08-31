import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  QuestionnaireCompletionAdmission,
  QuestionnaireCompletionAdmissionBusyError,
} from '../../services/questionnaireCompletionAdmission'

const nextTick = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('questionnaire completion admission', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('limits active work and drains queued completions in FIFO order', async () => {
    const admission = new QuestionnaireCompletionAdmission({
      maxConcurrent: 1,
      maxQueue: 2,
      maxWaitMs: 1_000,
      retryAfterSeconds: 1,
    })
    const order: string[] = []
    let releaseFirst!: () => void

    const first = admission.run(() => new Promise<string>((resolve) => {
      releaseFirst = () => {
        order.push('first')
        resolve('first')
      }
    }))
    const second = admission.run(async () => {
      order.push('second')
      return 'second'
    })
    const third = admission.run(async () => {
      order.push('third')
      return 'third'
    })

    await nextTick()
    expect(admission.getStats()).toMatchObject({ active: 1, queued: 2 })

    releaseFirst()
    await expect(Promise.all([first, second, third])).resolves.toEqual(['first', 'second', 'third'])
    expect(order).toEqual(['first', 'second', 'third'])
    expect(admission.getStats()).toMatchObject({ active: 0, queued: 0 })
  })

  it('rejects a request when the bounded queue is full', async () => {
    const admission = new QuestionnaireCompletionAdmission({
      maxConcurrent: 1,
      maxQueue: 1,
      maxWaitMs: 1_000,
      retryAfterSeconds: 2,
    })
    let releaseFirst!: () => void
    const first = admission.run(() => new Promise<void>((resolve) => {
      releaseFirst = resolve
    }))
    const queued = admission.run(async () => 'queued')
    const rejectedOperation = vi.fn(async () => 'rejected')
    const rejected = admission.run(rejectedOperation)

    await expect(rejected).rejects.toMatchObject({
      code: 'COMPLETION_BUSY',
      reason: 'queue_full',
      retryAfterSeconds: 2,
    })
    await expect(rejected).rejects.toBeInstanceOf(QuestionnaireCompletionAdmissionBusyError)
    expect(rejectedOperation).not.toHaveBeenCalled()
    expect(admission.getStats()).toMatchObject({ active: 1, queued: 1 })

    releaseFirst()
    await expect(Promise.all([first, queued])).resolves.toEqual([undefined, 'queued'])
    expect(admission.getStats()).toMatchObject({ active: 0, queued: 0 })
  })

  it('expires a queued request and leaves later admission usable', async () => {
    vi.useFakeTimers()
    const admission = new QuestionnaireCompletionAdmission({
      maxConcurrent: 1,
      maxQueue: 1,
      maxWaitMs: 25,
      retryAfterSeconds: 1,
    })
    let releaseFirst!: () => void
    const first = admission.run(() => new Promise<void>((resolve) => {
      releaseFirst = resolve
    }))
    const queued = admission.run(async () => 'queued')
    const queuedOutcome = queued.then(
      () => ({ kind: 'resolved' as const }),
      (error) => ({ kind: 'rejected' as const, error }),
    )

    await vi.advanceTimersByTimeAsync(26)
    const outcome = await queuedOutcome
    expect(outcome).toMatchObject({ kind: 'rejected', error: { code: 'COMPLETION_BUSY', reason: 'timeout' } })
    expect(admission.getStats()).toMatchObject({ active: 1, queued: 0 })

    // A timed-out queue entry must not consume a future slot or be executed
    // after the active operation eventually finishes.
    const independent = new QuestionnaireCompletionAdmission({
      maxConcurrent: 1,
      maxQueue: 0,
      maxWaitMs: 25,
      retryAfterSeconds: 1,
    })
    await expect(independent.run(async () => 'usable')).resolves.toBe('usable')
    releaseFirst()
    await expect(first).resolves.toBeUndefined()
  })
})
