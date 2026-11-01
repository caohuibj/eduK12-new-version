import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '../../types'
import jwt from 'jsonwebtoken'
import { config } from '../../config'

const { mockPrisma, revoked } = vi.hoisted(() => ({
  revoked: vi.fn(),
  mockPrisma: {
    $queryRaw: vi.fn(),
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../utils/sessionRevocation', () => ({ isSessionRevoked: revoked }))

import { SocketService } from '../../services/socketService'

const signedSession = (overrides: Record<string, unknown> = {}) => jwt.sign({
  userId: 'teacher-1', tokenVersion: 0, exp: Math.floor(Date.now() / 1000) + 3600, ...overrides,
}, config.jwtSecret)

const makeRemoteSocket = (data: Record<string, unknown>, token = signedSession()) => ({
  data,
  handshake: { headers: { cookie: `ptool_session=${token}` } },
  disconnect: vi.fn(),
})

const principalRow = (overrides: Record<string, unknown> = {}) => [{
  id: 'teacher-1',
  username: 'teacher-1',
  role: UserRole.TEACHER,
  platformRole: 'STANDARD',
  accountDomain: 'TRAINING',
  entryGrants: [],
  isActive: true,
  isFrozen: false,
  expiresAt: null,
  teacherApproved: true,
  tokenVersion: 0,
  mustChangePassword: false,
  ...overrides,
}]

describe('SocketService manager room revalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    revoked.mockResolvedValue(false)
  })

  it.each([
    { exp: Math.floor(Date.now() / 1000) - 1 },
    { userId: 'different-user' },
    { tokenVersion: 1 },
  ])('invalidates a connected signed session that no longer verifies its identity (%j)', async claims => {
    const socket = makeRemoteSocket({ authenticated: true, userId: 'teacher-1', tokenVersion: 0 }, signedSession(claims))
    mockPrisma.$queryRaw.mockResolvedValue(principalRow())
    await expect(new SocketService().refreshAuthenticatedSocket(socket as any)).resolves.toBe(false)
    expect(socket.data).toMatchObject({ authenticated: false, authenticationInvalidated: true })
    expect(socket.data.userId).toBeUndefined()
  })

  it('invalidates a revoked signed session', async () => {
    const socket = makeRemoteSocket({ authenticated: true, userId: 'teacher-1', tokenVersion: 0 })
    mockPrisma.$queryRaw.mockResolvedValue(principalRow())
    revoked.mockResolvedValue(true)
    await expect(new SocketService().refreshAuthenticatedSocket(socket as any)).resolves.toBe(false)
    expect(socket.data.authenticationInvalidated).toBe(true)
  })

  it('disconnects a manager whose account is no longer active', async () => {
    const remoteSocket = makeRemoteSocket({
      authenticated: true,
      userId: 'teacher-1',
      userRole: UserRole.TEACHER,
      platformRole: 'STANDARD',
      tokenVersion: 0,
    })
    const service = new SocketService()
    const fetchSockets = vi.fn().mockResolvedValue([remoteSocket])
    ;(service as any).classroomNamespace = {
      in: vi.fn().mockReturnValue({ fetchSockets }),
    }
    mockPrisma.$queryRaw.mockResolvedValue(principalRow({ isActive: false }))

    await expect(
      service.revalidateManagerSockets('classroom:classroom-1:teacher')
    ).resolves.toBe(true)

    expect(remoteSocket.disconnect).toHaveBeenCalledWith(true)
  })

  it('disconnects a socket whose legacy classroom role was downgraded', async () => {
    const remoteSocket = makeRemoteSocket({
      authenticated: true,
      userId: 'teacher-1',
      userRole: UserRole.TEACHER,
      platformRole: 'STANDARD',
      tokenVersion: 0,
    })
    const service = new SocketService()
    ;(service as any).classroomNamespace = {
      in: vi.fn().mockReturnValue({
        fetchSockets: vi.fn().mockResolvedValue([remoteSocket]),
      }),
    }
    mockPrisma.$queryRaw.mockResolvedValue(principalRow({ role: UserRole.STUDENT }))

    await service.revalidateManagerSockets('classroom:classroom-1:teacher')

    expect(remoteSocket.disconnect).toHaveBeenCalledWith(true)
  })

  it('refreshes a platform demotion on the next protected socket revalidation', async () => {
    const remoteSocket = makeRemoteSocket({
      authenticated: true,
      userId: 'teacher-1',
      userRole: UserRole.TEACHER,
      platformRole: 'SYSTEM_ADMIN',
      tokenVersion: 0,
    })
    const service = new SocketService()
    ;(service as any).classroomNamespace = {
      in: vi.fn().mockReturnValue({
        fetchSockets: vi.fn().mockResolvedValue([remoteSocket]),
      }),
    }
    mockPrisma.$queryRaw.mockResolvedValue(principalRow({ platformRole: 'STANDARD' }))

    await service.revalidateManagerSockets('classroom:classroom-1:teacher')

    expect(remoteSocket.data.platformRole).toBe('STANDARD')
    expect(remoteSocket.disconnect).not.toHaveBeenCalled()
  })

  it('disconnects a socket whose token version was revoked', async () => {
    const remoteSocket = makeRemoteSocket({
      authenticated: true,
      userId: 'teacher-1',
      userRole: UserRole.TEACHER,
      platformRole: 'STANDARD',
      tokenVersion: 0,
    })
    const service = new SocketService()
    ;(service as any).classroomNamespace = {
      in: vi.fn().mockReturnValue({
        fetchSockets: vi.fn().mockResolvedValue([remoteSocket]),
      }),
    }
    mockPrisma.$queryRaw.mockResolvedValue(principalRow({ tokenVersion: 1 }))

    await service.revalidateManagerSockets('classroom:classroom-1:teacher')

    expect(remoteSocket.disconnect).toHaveBeenCalledWith(true)
  })

  it('disconnects a socket that still has a temporary password', async () => {
    const remoteSocket = makeRemoteSocket({
      authenticated: true,
      userId: 'teacher-1',
      userRole: UserRole.TEACHER,
      platformRole: 'STANDARD',
      tokenVersion: 0,
    })
    const service = new SocketService()
    ;(service as any).classroomNamespace = {
      in: vi.fn().mockReturnValue({
        fetchSockets: vi.fn().mockResolvedValue([remoteSocket]),
      }),
    }
    mockPrisma.$queryRaw.mockResolvedValue(principalRow({ mustChangePassword: true }))

    await service.revalidateManagerSockets('classroom:classroom-1:teacher')

    expect(remoteSocket.disconnect).toHaveBeenCalledWith(true)
  })
})
