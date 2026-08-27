import { describe, expect, it, vi } from 'vitest'
import { csrfProtection } from '../../middleware/csrf'

const makeReq = (overrides: Record<string, unknown> = {}) => {
  const headers = (overrides.headers || {}) as Record<string, string>
  return {
    method: 'POST',
    path: '/courses',
    headers,
    get: (name: string) => headers[name.toLowerCase()],
    ...overrides,
  } as any
}

const makeRes = () => {
  const res: any = { statusCode: 0, body: null }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: unknown) => {
    res.body = body
    return res
  })
  return res
}

describe('CSRF protection', () => {
  it('rejects cookie-authenticated writes without a matching double-submit token', () => {
    const res = makeRes()
    const next = vi.fn()

    csrfProtection(makeReq({ headers: { cookie: 'ptool_session=session' } }), res, next)

    expect(res.statusCode).toBe(403)
    expect(res.body.message).toBe('CSRF 校验失败')
    expect(next).not.toHaveBeenCalled()
  })

  it('allows writes with matching CSRF cookie and header', () => {
    const res = makeRes()
    const next = vi.fn()

    csrfProtection(makeReq({
      headers: {
        cookie: 'ptool_csrf=csrf-value',
        'x-csrf-token': 'csrf-value',
      },
    }), res, next)

    expect(res.statusCode).toBe(0)
    expect(next).toHaveBeenCalledOnce()
  })

  it('leaves capability-authenticated public endpoints to their own middleware', () => {
    const res = makeRes()
    const next = vi.fn()

    csrfProtection(makeReq({ path: '/public/assessments/session/complete' }), res, next)

    expect(res.statusCode).toBe(0)
    expect(next).toHaveBeenCalledOnce()
  })
})
