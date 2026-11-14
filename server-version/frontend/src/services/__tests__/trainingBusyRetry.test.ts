import { describe, expect, it, vi } from 'vitest'
import { normalizeApiError as normalizeClientError } from '../../api/client'
import { isTrainingBusy, runTrainingRetry, trainingRetryDelayMs, TrainingRetryCancelledError } from '../trainingBusyRetry'

describe('training busy retries', () => {
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
})
