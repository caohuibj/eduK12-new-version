import { describe, expect, it, vi } from 'vitest'
import {
  finalDraftCapacityRetryDelayMs,
  isFinalDraftCapacityRetryable,
  runFinalDraftCapacityRetry,
} from '../finalDraftCapacityRetry'

describe('finalDraftCapacityRetry', () => {
  it('whitelists capacity/network failures only', () => {
    expect(isFinalDraftCapacityRetryable({ status: 503, code: 'ASSESSMENT_SUBMIT_BUSY' })).toBe(true)
    expect(isFinalDraftCapacityRetryable({ status: 502 })).toBe(true)
    expect(isFinalDraftCapacityRetryable({ status: 504 })).toBe(true)
    expect(isFinalDraftCapacityRetryable({ status: null, message: 'Network Error', retryable: true })).toBe(true)
    expect(isFinalDraftCapacityRetryable({ status: 409, code: 'STALE_ATTEMPT' })).toBe(false)
    expect(isFinalDraftCapacityRetryable({ status: 400, code: 'SUBMISSION_PAYLOAD_CONFLICT' })).toBe(false)
    // Gate-E A1: public limiter 429 must NOT enter FinalDraft capacity retry.
    expect(isFinalDraftCapacityRetryable({ status: 429 })).toBe(false)
    expect(isFinalDraftCapacityRetryable({ status: 429, code: 'RATE_LIMITED' })).toBe(false)
  })

  it('uses Retry-After as a floor and grows with attempt + jitter', () => {
    // Retry-After=1s must not pin every attempt near 1s when backoff grows.
    const attempt1 = finalDraftCapacityRetryDelayMs(1, 1000, () => 0)
    const attempt2 = finalDraftCapacityRetryDelayMs(2, 1000, () => 0)
    const attempt3 = finalDraftCapacityRetryDelayMs(3, 1000, () => 0)
    expect(attempt1).toBe(1000)
    expect(attempt2).toBe(2000)
    expect(attempt3).toBe(4000)

    const withJitter = finalDraftCapacityRetryDelayMs(1, 1000, () => 1)
    expect(withJitter).toBeGreaterThan(1000)
    expect(withJitter).toBeLessThanOrEqual(30_000)
  })

  it('respects larger Retry-After up to the 30s safety cap', () => {
    expect(finalDraftCapacityRetryDelayMs(1, 12_000, () => 0)).toBe(12_000)
    expect(finalDraftCapacityRetryDelayMs(1, 60_000, () => 0)).toBe(30_000)
  })

  it('retries the same operation until success without enabling a new submissionId', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce({ status: 503, code: 'ASSESSMENT_SUBMIT_BUSY', retryAfterMs: 10 })
      .mockResolvedValueOnce({ ok: true })
    const onRetry = vi.fn()
    const sleep = vi.fn(async () => undefined)
    await expect(runFinalDraftCapacityRetry({
      maxAttempts: 3,
      onRetry,
      operation,
      sleep,
      random: () => 0,
    })).resolves.toEqual({ ok: true })
    expect(operation).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledTimes(1)
    const delayMs = onRetry.mock.calls[0]?.[0]?.delayMs
    expect(typeof delayMs).toBe('number')
    expect(delayMs).toBeGreaterThanOrEqual(1000)
  })
})
