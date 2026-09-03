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
  })

  it('caps attempt-aware jitter at 5 seconds', () => {
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const delay = finalDraftCapacityRetryDelayMs(attempt, 1200, () => 1)
      expect(delay).toBeGreaterThanOrEqual(1000)
      expect(delay).toBeLessThanOrEqual(5000)
    }
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
  })
})
