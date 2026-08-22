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

import { authenticate, optionalAuthenticate } from '../../middleware/auth'

const payload = { userId: 'user-1', username: 'u1', role: UserRole.STUDENT }

const activeUser = {
  isActive: true,
  isFrozen: false,
  expiresAt: null,
  role: UserRole.STUDENT,
  teacherApproved: true,
}

const makeReq = (authorization?: string) =>
  ({
    headers: authorization ? { authorization } : {},
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

    await authenticate(makeReq('Bearer valid-token'), res, next)

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

    await authenticate(makeReq('Bearer valid-token'), res, next)

    expect(res.statusCode).toBe(401)
    expect(res.body.message).toContain('等待管理员审核')
    expect(next).not.toHaveBeenCalled()
  })

  it('attaches the payload for an active account', async () => {
    const req = makeReq('Bearer valid-token')
    const res = makeRes()
    const next = vi.fn()

    await authenticate(req, res, next)

    expect(req.user).toEqual(payload)
    expect(next).toHaveBeenCalledOnce()
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
    const req = makeReq('Bearer valid-token')
    const res = makeRes()
    const next = vi.fn()

    await optionalAuthenticate(req, res, next)

    expect(req.user).toBeUndefined()
    expect(res.statusCode).toBe(0)
    expect(next).toHaveBeenCalledOnce()
  })
})
