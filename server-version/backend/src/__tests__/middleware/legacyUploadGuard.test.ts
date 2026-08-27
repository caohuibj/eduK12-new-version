import { describe, expect, it, vi } from 'vitest'
import { legacyUploadGuard } from '../../middleware/legacyUploadGuard'

const makeRes = () => {
  const res: any = { statusCode: 200, body: null }
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

describe('legacy upload guard', () => {
  it('blocks the private asset namespace during the migration window', () => {
    const res = makeRes()
    const next = vi.fn()

    legacyUploadGuard(true)({ path: '/assets/asset-1.pdf' } as any, res, next)

    expect(res.statusCode).toBe(410)
    expect(res.body.message).toBe('资产必须通过签名接口访问')
    expect(next).not.toHaveBeenCalled()
  })

  it('keeps legacy paths available only while explicitly enabled', () => {
    const res = makeRes()
    const next = vi.fn()

    legacyUploadGuard(false)({ path: '/images/legacy.png' } as any, res, next)

    expect(res.statusCode).toBe(410)
    expect(next).not.toHaveBeenCalled()
  })
})
