import { describe, expect, it } from 'vitest'
import { normalizeApiError } from '../client'

describe('api client error normalization', () => {
  it('explains a raw transient 503 in Chinese and retains retry classification', () => {
    const error = normalizeApiError({ message: 'Request failed with status code 503', response: { status: 503 } })
    expect(error.message).toBe('服务暂时不可用，请稍后重试。')
    expect(error.status).toBe(503)
    expect(error.retryable).toBe(true)
  })
  it('preserves the HTTP status alongside the API envelope', () => {
    const error = normalizeApiError({
      name: 'AxiosError',
      message: 'Request failed',
      response: {
        status: 409,
        data: { code: -1, message: 'Idempotency-Key 已用于其他提交内容' },
      },
    })

    expect(error.status).toBe(409)
    expect(error.code).toBe(-1)
    expect(error.message).toBe('Idempotency-Key 已用于其他提交内容')
    expect(error.data).toEqual({ code: -1, message: 'Idempotency-Key 已用于其他提交内容' })
    expect(error.retryable).toBe(false)
  })

  it('keeps transport failures distinguishable from HTTP failures', () => {
    const error = normalizeApiError({ name: 'AxiosError', message: 'Network Error' })

    expect(error.status).toBeUndefined()
    expect(error.message).toBe('Network Error')
    expect(error.retryable).toBe(true)
  })

  it('preserves Retry-After from an overloaded response', () => {
    const error = normalizeApiError({
      name: 'AxiosError',
      response: {
        status: 429,
        headers: { 'retry-after': '4' },
        data: { code: -1, message: '请求过于频繁' },
      },
    })

    expect(error.retryable).toBe(true)
    expect(error.retryAfterMs).toBe(4000)
  })
})
