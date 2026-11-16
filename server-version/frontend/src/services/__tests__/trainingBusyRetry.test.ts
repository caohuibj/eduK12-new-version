import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeApiError as normalizeClientError } from '../../api/client'
import {
  isTrainingBusy,
  runTrainingRetry,
  trainingRetryDelayMs,
  TrainingRetryCancelledError,
  TrainingRetryTimeoutError,
} from '../trainingBusyRetry'

describe('training busy retries', () => {
  afterEach(() => {
    vi.useRealTimers()
  })
  it('allows at most five START attempts within the 60 second budget', async () => {
    let time = 0
    const busy = { status: 503, code: 'INSTRUMENT_NOT_AVAILABLE' }
    const operation = vi.fn().mockRejectedValue(busy)
    const sleep = vi.fn(async (delay: number) => { time += delay })
    await expect(runTrainingRetry(operation, () => ({ kind: 'retry', retryAfterMs: 8_000 }), {
      maxAttempts: 5, maxTotalWaitMs: 60_000, random: () => 0, now: () => time, sleep,
    })).rejects.toBe(busy)
    expect(operation).toHaveBeenCalledTimes(5)
    expect(sleep).toHaveBeenCalledTimes(4)
    expect(time).toBe(32_000)
  })

  it('stops before a fifth attempt when request time and Retry-After exhaust the budget', async () => {
    let time = 0
    const busy = { status: 503, code: 'INSTRUMENT_NOT_AVAILABLE' }
    const operation = vi.fn(async () => { time += 9_000; throw busy })
    const sleep = vi.fn(async (delay: number) => { time += delay })
    await expect(runTrainingRetry(operation, () => ({ kind: 'retry', retryAfterMs: 8_000 }), {
      maxAttempts: 5, maxTotalWaitMs: 60_000, random: () => 0, now: () => time, sleep,
    })).rejects.toBe(busy)
    expect(operation).toHaveBeenCalledTimes(4)
    expect(sleep).toHaveBeenCalledTimes(3)
    expect(time).toBe(60_000)
  })
  it('adds jitter after the server delay and recognizes only explicit busy responses', () => {
    expect(trainingRetryDelayMs(10_000, () => 0)).toBe(10_000)
    expect(trainingRetryDelayMs(10_000, () => 1)).toBe(14_000)
    expect(isTrainingBusy({ status: 503, code: 'LOGIN_VERIFY_BUSY' }, ['LOGIN_VERIFY_BUSY'])).toBe(true)
    expect(isTrainingBusy({ status: 503, code: -1 }, ['LOGIN_VERIFY_BUSY'])).toBe(false)
    expect(isTrainingBusy({ status: 429, code: 'LOGIN_VERIFY_BUSY' }, ['LOGIN_VERIFY_BUSY'])).toBe(false)
  })

  it.each(['LOGIN_VERIFY_BUSY', 'LOGIN_LOOKUP_BUSY', 'INSTRUMENT_NOT_AVAILABLE', 'ASSESSMENT_START_BUSY'])(
    'recognizes %s after the real API client normalizes an Axios 503', (code) => {
      const error = normalizeClientError({
        name: 'AxiosError', code: 'ERR_BAD_RESPONSE', message: 'Request failed with status code 503',
        response: { status: 503, data: { code, message: 'busy' }, headers: { 'retry-after': '10' } },
      })
      expect(isTrainingBusy(error, [code])).toBe(true)
      expect(error.retryAfterMs).toBe(10_000)
    },
  )

  it('retries at most twice and honors Retry-After', async () => {
    const error = { status: 503, code: 'LOGIN_VERIFY_BUSY', retryAfterMs: 10_000 }
    const operation = vi.fn().mockRejectedValue(error)
    const sleep = vi.fn(async (_milliseconds: number, _signal?: AbortSignal) => {})
    await expect(runTrainingRetry(operation, (cause) => isTrainingBusy(cause, ['LOGIN_VERIFY_BUSY'])
      ? { kind: 'retry', retryAfterMs: 10_000 } : { kind: 'stop' }, { random: () => 0.5, sleep })).rejects.toBe(error)
    expect(operation).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([12_000, 12_000])
  })

  it('does not shorten a server delay that exceeds the wait budget', async () => {
    const error = { status: 503, code: 'LOGIN_VERIFY_BUSY', retryAfterMs: 60_000 }
    const operation = vi.fn().mockRejectedValue(error)
    const sleep = vi.fn(async (_milliseconds: number, _signal?: AbortSignal) => {})
    await expect(runTrainingRetry(operation, () => ({ kind: 'retry', retryAfterMs: 60_000 }), { sleep })).rejects.toBe(error)
    expect(operation).toHaveBeenCalledOnce()
    expect(sleep).not.toHaveBeenCalled()
  })

  it('includes time spent on requests when deciding whether another wait fits', async () => {
    let time = 0
    const error = { status: 503, code: 'LOGIN_VERIFY_BUSY', retryAfterMs: 10_000 }
    const operation = vi.fn(async () => { time = 30_000; throw error })
    const sleep = vi.fn(async (_milliseconds: number, _signal?: AbortSignal) => {})
    await expect(runTrainingRetry(operation, () => ({ kind: 'retry', retryAfterMs: 10_000 }), { now: () => time, random: () => 0, sleep })).rejects.toBe(error)
    expect(operation).toHaveBeenCalledOnce()
    expect(sleep).not.toHaveBeenCalled()
  })

  it('does not replay a login after its session has been superseded', async () => {
    let current = true
    const operation = vi.fn().mockRejectedValue({ status: 503, code: 'LOGIN_VERIFY_BUSY' })
    const sleep = vi.fn(async () => { current = false })
    await expect(runTrainingRetry(operation, () => ({ kind: 'retry' }), { sleep, isCurrent: () => current })).rejects.toBeInstanceOf(TrainingRetryCancelledError)
    expect(operation).toHaveBeenCalledOnce()
  })

  it('aborts hung promises within per-attempt timeout and enforces the 35s total budget', async () => {
    vi.useFakeTimers()
    const attemptSignals: AbortSignal[] = []
    const operation = vi.fn((signal: AbortSignal) => {
      attemptSignals.push(signal)
      return new Promise<string>(() => {})
    })
    const decide = vi.fn(() => ({ kind: 'retry' as const, retryAfterMs: 1_000 }))

    const retryPromise = runTrainingRetry(operation, decide, {
      random: () => 0,
      requestTimeoutMs: 25_000,
      maxTotalWaitMs: 35_000,
    })
    const caught = retryPromise.catch((err) => err)

    // Attempt 1 hangs for 25_000ms -> timeout aborts signal[0], then 1_000ms retry sleep -> attempt 2 gets remaining 9_000ms
    await vi.advanceTimersByTimeAsync(25_000)
    expect(operation).toHaveBeenCalledTimes(1)
    expect(attemptSignals[0]?.aborted).toBe(true)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(operation).toHaveBeenCalledTimes(2)
    expect(attemptSignals[1]?.aborted).toBe(false)

    // Remaining budget from 35_000ms total is 9_000ms (25_000 + 1_000 + 9_000)
    await vi.advanceTimersByTimeAsync(9_000)
    expect(attemptSignals[1]?.aborted).toBe(true)

    const result = await caught
    expect(result).toBeInstanceOf(TrainingRetryTimeoutError)
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('cancels an in-flight hung request via AbortSignal without sending follow-up retries', async () => {
    vi.useFakeTimers()
    const outer = new AbortController()
    const seenSignals: AbortSignal[] = []
    const operation = vi.fn((signal: AbortSignal) => {
      seenSignals.push(signal)
      return new Promise<string>(() => {})
    })
    const decide = vi.fn(() => ({ kind: 'retry' as const, retryAfterMs: 1_000 }))

    const promise = runTrainingRetry(operation, decide, { signal: outer.signal })
    const caught = promise.catch((err) => err)

    await vi.advanceTimersByTimeAsync(500)
    outer.abort()
    await vi.advanceTimersByTimeAsync(0)

    const err = await caught
    expect(err).toBeInstanceOf(TrainingRetryCancelledError)
    expect(seenSignals).toHaveLength(1)
    expect(seenSignals[0]?.aborted).toBe(true)
    expect(decide).not.toHaveBeenCalled()
    expect(operation).toHaveBeenCalledTimes(1)
  })


  it('enforces the 60s total START budget across a timed-out request and jittered 10s retry', async () => {
    vi.useFakeTimers()
    const requests: AbortSignal[] = []
    const operation = vi.fn((signal: AbortSignal) => {
      requests.push(signal)
      return new Promise<string>(() => {})
    })
    const promise = runTrainingRetry(operation, () => ({ kind: 'retry' as const, retryAfterMs: 10_000 }), {
      maxAttempts: 5,
      maxTotalWaitMs: 60_000,
      requestTimeoutMs: 25_000,
      random: () => 1,
    })
    const caught = promise.catch(error => error)

    await vi.advanceTimersByTimeAsync(25_000)
    expect(requests[0]?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(14_000)
    expect(operation).toHaveBeenCalledTimes(2)
    expect(requests[1]?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(21_000)
    expect(requests[1]?.aborted).toBe(true)
    expect(await caught).toBeInstanceOf(TrainingRetryTimeoutError)
    expect(operation).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels during a memory-pressure Retry-After sleep without starting another request', async () => {
    vi.useFakeTimers()
    const outer = new AbortController()
    const busy = { status: 503, code: 'INSTRUMENT_NOT_AVAILABLE', retryAfterMs: 10_000 }
    const operation = vi.fn().mockRejectedValue(busy)
    const promise = runTrainingRetry(operation, () => ({ kind: 'retry' as const, retryAfterMs: 10_000 }), {
      maxAttempts: 5, maxTotalWaitMs: 60_000, random: () => 0, signal: outer.signal,
    })
    const caught = promise.catch(error => error)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(operation).toHaveBeenCalledOnce()
    outer.abort()
    expect(await caught).toBeInstanceOf(TrainingRetryCancelledError)
    await vi.advanceTimersByTimeAsync(12_000)
    expect(operation).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('provides live getRemainingWaitMs that reflects time elapsed inside decide', async () => {
    let time = 0
    const samples: number[] = []
    const operation = vi.fn(async () => {
      time = 25_000
      throw new TrainingRetryTimeoutError()
    })

    await expect(runTrainingRetry(
      operation,
      async (_err, ctx) => {
        samples.push(ctx.remainingWaitMs, ctx.getRemainingWaitMs())
        time = 33_000
        samples.push(ctx.getRemainingWaitMs())
        return { kind: 'stop' }
      },
      { now: () => time, maxTotalWaitMs: 35_000, requestTimeoutMs: 25_000 },
    )).rejects.toBeInstanceOf(TrainingRetryTimeoutError)

    expect(samples).toEqual([10_000, 10_000, 2_000])
  })
})
