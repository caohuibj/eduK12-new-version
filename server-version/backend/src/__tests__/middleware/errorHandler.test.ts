import { describe, expect, it, vi } from 'vitest'

const mockLogger = vi.hoisted(() => ({ error: vi.fn() }))
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
})
