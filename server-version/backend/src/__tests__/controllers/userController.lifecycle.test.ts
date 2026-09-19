import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockPrisma, mockSetUserActiveState } = vi.hoisted(() => ({
  mockPrisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
  mockSetUserActiveState: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../services/userLifecycleService', async () => {
  const actual = await vi.importActual<any>('../../services/userLifecycleService')
  return { ...actual, setUserActiveState: mockSetUserActiveState }
})

import { userController } from '../../controllers/userController'

const makeRes = () => {
  const res: any = { statusCode: 0, body: null }
  res.status = vi.fn((statusCode: number) => {
    res.statusCode = statusCode
    return res
  })
  res.json = vi.fn((body: unknown) => {
    res.body = body
    return res
  })
  return res
}

describe('userController lifecycle delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates isActive changes before legacy profile-role authorization and never writes the user directly', async () => {
    mockSetUserActiveState.mockResolvedValue({ id: 'target-1', isActive: false })
    const req = {
      params: { id: 'target-1' },
      body: { isActive: false },
      user: {
        userId: 'system-1',
        username: 'system-1',
        role: UserRole.STUDENT,
        platformRole: 'SYSTEM_ADMIN',
        tokenVersion: 0,
        mustChangePassword: false,
      },
    } as any
    const res = makeRes()

    await userController.update(req, res)

    expect(mockSetUserActiveState).toHaveBeenCalledWith({
      actorUserId: 'system-1',
      targetUserId: 'target-1',
      isActive: false,
    })
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(0)
    expect(res.body.data).toEqual({ id: 'target-1', isActive: false })
  })

  it('rejects mixing lifecycle and profile mutations in one request', async () => {
    const req = {
      params: { id: 'target-1' },
      body: { isActive: false, nickname: 'mixed' },
      user: {
        userId: 'system-1',
        username: 'system-1',
        role: UserRole.ADMIN,
        platformRole: 'SYSTEM_ADMIN',
        tokenVersion: 0,
        mustChangePassword: false,
      },
    } as any
    const res = makeRes()

    await userController.update(req, res)

    expect(res.statusCode).toBe(400)
    expect(mockSetUserActiveState).not.toHaveBeenCalled()
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })
})
