import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockPrisma, mockVerifyToken } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
  },
  mockVerifyToken: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../utils/jwt', () => ({ verifyToken: mockVerifyToken }))

import { authenticate, optionalAuthenticate, requireSelfOrAdmin } from '../../middleware/auth'

const payload = { userId: 'user-1', username: 'u1', role: UserRole.STUDENT, tokenVersion: 0 }

const activeUser = {
  isActive: true,
  isFrozen: false,
  expiresAt: null,
  role: UserRole.STUDENT,
  teacherApproved: true,
  tokenVersion: 0,
  mustChangePassword: false,
}

const makeReq = (sessionToken?: string) =>
  ({
    headers: sessionToken ? { cookie: `ptool_session=${encodeURIComponent(sessionToken)}` } : {},
    params: { id: 'user-1' },
    user: undefined,
  }) as any

const makeRes = () => {
  const res: any = { statusCode: 0, body: null }
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

describe('authenticate account status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyToken.mockReturnValue(payload)
    mockPrisma.user.findUnique.mockResolvedValue(activeUser)
  })

  it('rejects a frozen account even when the JWT is still valid', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...activeUser, isFrozen: true })
    const res = makeRes()
    const next = vi.fn()

    await authenticate(makeReq('valid-token'), res, next)

    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('账号已被冻结，请联系教师')
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects a pending teacher while the JWT is still valid', async () => {
    mockVerifyToken.mockReturnValue({ ...payload, role: UserRole.TEACHER })
    mockPrisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      role: UserRole.TEACHER,
      teacherApproved: false,
    })
    const res = makeRes()
    const next = vi.fn()

    await authenticate(makeReq('valid-token'), res, next)

    expect(res.statusCode).toBe(401)
    expect(res.body.message).toContain('等待管理员审核')
    expect(next).not.toHaveBeenCalled()
  })

  it('attaches the payload for an active account', async () => {
    const req = makeReq('valid-token')
    const res = makeRes()
    const next = vi.fn()

    await authenticate(req, res, next)

    expect(req.user).toEqual({ ...payload, mustChangePassword: false })
    expect(next).toHaveBeenCalledOnce()
  })

  it('rejects a token issued before a forced logout or password change', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...activeUser, tokenVersion: 1 })
    const res = makeRes()
    const next = vi.fn()

    await authenticate(makeReq('stale-token'), res, next)

    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('认证令牌已失效，请重新登录')
    expect(next).not.toHaveBeenCalled()
  })
})

describe('optionalAuthenticate account status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyToken.mockReturnValue(payload)
    mockPrisma.user.findUnique.mockResolvedValue(activeUser)
  })

  it('ignores a frozen token instead of returning 401', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...activeUser, isFrozen: true })
    const req = makeReq('valid-token')
    const res = makeRes()
    const next = vi.fn()

    await optionalAuthenticate(req, res, next)

    expect(req.user).toBeUndefined()
    expect(res.statusCode).toBe(0)
    expect(next).toHaveBeenCalledOnce()
  })
})

describe('requireSelfOrAdmin', () => {
  it('rejects access to another user record', () => {
    const req = { user: payload, params: { id: 'user-2' } } as any
    const res = makeRes()
    const next = vi.fn()

    requireSelfOrAdmin(req, res, next)

    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('allows an administrator to inspect another user record', () => {
    const req = { user: { ...payload, role: UserRole.ADMIN }, params: { id: 'user-2' } } as any
    const res = makeRes()
    const next = vi.fn()

    requireSelfOrAdmin(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })
})
