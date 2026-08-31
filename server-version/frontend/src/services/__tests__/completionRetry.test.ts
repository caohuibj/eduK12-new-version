import { describe, expect, it, vi } from 'vitest'
import {
  completionRetryDelayMs,
  isCompletionBusyError,
  runWithCompletionRetry,
} from '../completionRetry'

describe('questionnaire completion retry', () => {
  it('recognizes only the explicit retryable completion capacity response', () => {
    expect(isCompletionBusyError({ status: 503, code: 'COMPLETION_BUSY', retryAfterMs: 1_000 })).toBe(true)
    expect(isCompletionBusyError({ status: 503, code: 'OTHER_ERROR' })).toBe(false)
    expect(isCompletionBusyError({ status: 409, code: 'COMPLETION_BUSY' })).toBe(false)
  })

  it('respects Retry-After while keeping a bounded jitter delay', () => {
    expect(completionRetryDelayMs({ status: 503, code: 'COMPLETION_BUSY', retryAfterMs: 1_000 }, () => 0)).toBe(1_000)
    expect(completionRetryDelayMs({ status: 503, code: 'COMPLETION_BUSY' }, () => 1)).toBe(1_500)
  })

  it('retries busy completion requests and stops at the configured attempt limit', async () => {
    const sleep = vi.fn(async () => undefined)
    const operation = vi.fn()
      .mockRejectedValueOnce({ status: 503, code: 'COMPLETION_BUSY', retryAfterMs: 1_000 })
      .mockResolvedValueOnce('completed')

    await expect(runWithCompletionRetry(operation, { sleep, random: () => 0 })).resolves.toBe('completed')
    expect(operation).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(1_000)

    const exhaustedError = { status: 503, code: 'COMPLETION_BUSY' }
    const exhausted = vi.fn().mockRejectedValue(exhaustedError)
    await expect(runWithCompletionRetry(exhausted, { maxAttempts: 2, sleep })).rejects.toBe(exhaustedError)
    expect(exhausted).toHaveBeenCalledTimes(2)
  })

  it('does not retry a business conflict', async () => {
    const operation = vi.fn().mockRejectedValue({ status: 409, code: 'TRIAL_CONFLICT' })
    await expect(runWithCompletionRetry(operation)).rejects.toMatchObject({ code: 'TRIAL_CONFLICT' })
    expect(operation).toHaveBeenCalledTimes(1)
  })
})
