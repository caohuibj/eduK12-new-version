import { describe, expect, it, vi } from 'vitest'

const mockLogger = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn() }))
vi.mock('../../utils/logger', () => ({ logger: mockLogger }))

import { errorHandler } from '../../middleware/errorHandler'

const makeRes = () => {
  const res: any = { statusCode: 0, body: null }
  res.setHeader = vi.fn()
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: any) => {
    res.body = body
    return res
  })
  return res
}

describe('error handler disclosure boundary', () => {
  it('returns a generic message for unknown server errors', () => {
    const res = makeRes()

    errorHandler(new Error('database password=should-not-leak'), { requestId: 'request-1' } as any, res, vi.fn())

    expect(res.statusCode).toBe(500)
    expect(res.body.message).toBe('服务器内部错误')
    expect(mockLogger.error).toHaveBeenCalledWith('Unhandled request error', expect.objectContaining({
      requestId: 'request-1',
    }))
  })

  it('keeps a missing shared runtime retryable and supplies Retry-After without exposing internals', () => {
    const res = makeRes()
    errorHandler({ code: 'ASSESSMENT_RUNTIME_UNAVAILABLE', statusCode: 503, message: 'private internal detail' }, {} as any, res, vi.fn())
    expect(res.statusCode).toBe(503)
    expect(res.body.code).toBe('ASSESSMENT_RUNTIME_UNAVAILABLE')
    expect(res.body.message).not.toContain('private')
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '5')
  })

  it('keeps explicitly classified client errors usable', () => {
    const res = makeRes()

    errorHandler({ statusCode: 400, message: '请求参数无效' }, {} as any, res, vi.fn())

    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('请求参数无效')
  })

  it('classifies transient DB pool and interactive-transaction contention on GET reads as retryable 503 SERVICE_BUSY', () => {
    for (const err of [
      { code: 'P2024', message: 'Timed out fetching a new connection from the connection pool' },
      { code: 'P2028', message: 'Unable to start a transaction in the given time' },
      { code: 'P2010', meta: { code: '57014' }, message: 'canceling statement due to statement timeout' },
      { code: '53300', message: 'sorry, too many clients already' },
    ]) {
      const res = makeRes()
      errorHandler(err, { method: 'GET', requestId: 'req-get' } as any, res, vi.fn())
      expect(res.statusCode).toBe(503)
      expect(res.body).toEqual({
        code: 'SERVICE_BUSY',
        message: '服务繁忙，请稍后重试',
        data: null,
      })
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '1')
    }
  })

  it('does not classify mutating POST transient DB contention as generic 503 SERVICE_BUSY', () => {
    const res = makeRes()
    errorHandler({ code: 'P2024', message: 'pool timeout' }, { method: 'POST', requestId: 'req-post' } as any, res, vi.fn())
    expect(res.statusCode).toBe(500)
    expect(res.body.message).toBe('服务器内部错误')
  })
})
