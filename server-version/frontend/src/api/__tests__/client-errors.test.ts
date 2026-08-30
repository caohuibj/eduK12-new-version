import { describe, expect, it } from 'vitest'
import { normalizeApiError } from '../client'

describe('api client error normalization', () => {
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
  })

  it('keeps transport failures distinguishable from HTTP failures', () => {
    const error = normalizeApiError({ name: 'AxiosError', message: 'Network Error' })

    expect(error.status).toBeUndefined()
    expect(error.message).toBe('Network Error')
  })
})
