import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '../../types'
import jwt from 'jsonwebtoken'
import { config } from '../../config'

const { mockPrisma, revoked } = vi.hoisted(() => ({
  revoked: vi.fn(),
  mockPrisma: {
    $queryRaw: vi.fn(),
    classroom: { findUnique: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../utils/sessionRevocation', () => ({ isSessionRevoked: revoked }))

import { isClassroomSocketOriginAllowed, SocketService } from '../../services/socketService'

const signedSession = (overrides: Record<string, unknown> = {}) => jwt.sign({
  userId: 'teacher-1', tokenVersion: 0, exp: Math.floor(Date.now() / 1000) + 3600, ...overrides,
}, config.jwtSecret)

const makeRemoteSocket = (data: Record<string, unknown>, token = signedSession()) => ({
  data,
  handshake: { headers: { cookie: `ptool_session=${token}` } },
  disconnect: vi.fn(),
  emit: vi.fn(),
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

describe('classroom socket origins', () => {
  it('allows same-origin polling, native clients and the configured frontend', () => {
    expect(isClassroomSocketOriginAllowed({ host: 'classroom.example:4010' })).toBe(true)
    expect(isClassroomSocketOriginAllowed({ host: 'classroom.example:4010', origin: 'http://classroom.example:4010' })).toBe(true)
    expect(isClassroomSocketOriginAllowed({ host: 'api.example', origin: config.corsOrigin })).toBe(true)
  })

  it('checks the entire origin, including the scheme provided by trusted ingress', () => {
    const host = 'classroom.example'
    const headers = { host, 'x-forwarded-proto': 'https', origin: 'https://classroom.example' }
    const previousHops = config.trustProxyHops
    try {
      config.trustProxyHops = 2
      expect(isClassroomSocketOriginAllowed(headers)).toBe(true)
      for (const origin of ['null', 'http://classroom.example', 'https://unrelated.example', 'https://classroom.example:8443']) {
        expect(isClassroomSocketOriginAllowed({ ...headers, origin })).toBe(false)
      }
      config.trustProxyHops = 0
      expect(isClassroomSocketOriginAllowed(headers)).toBe(false)
    } finally {
      config.trustProxyHops = previousHops
    }
  })
})

describe('SocketService manager room revalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    revoked.mockResolvedValue(false)
    mockPrisma.classroom.findUnique.mockResolvedValue({ creatorId: 'teacher-1', course: { creatorId: 'owner' } })
  })

  it.each([
    { exp: Math.floor(Date.now() / 1000) - 1 },
    { userId: 'different-user' },
    { tokenVersion: 1 },
    { accountDomain: 'SCHOOL' },
    { accountDomain: 'SURVEY' },
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

  it('delivers only to current managers when two teachers still occupy the manager rooms', async () => {
    const proof = { adminVerifiedAt: Math.floor(Date.now() / 1000), adminSessionId: 'synthetic-proof' }
    const connected = (id: string) => makeRemoteSocket(
      { authenticated: true, userId: id, userRole: UserRole.ADMIN, tokenVersion: 0 }, signedSession({ userId: id, ...proof }))
    const owner = connected('teacher-1'), formerManager = connected('other-teacher')
    const service = new SocketService()
    const rooms = vi.fn().mockReturnValue({ fetchSockets: vi.fn().mockResolvedValue([owner, formerManager]) })
    ;(service as any).classroomNamespace = { in: rooms }
    const grant = { entry: 'TRAINING', version: 1 }
    let ownerApproved = true, ownerGranted = true
    mockPrisma.$queryRaw.mockImplementation((_: unknown, id: string) => Promise.resolve(principalRow({
      id, entryGrants: id !== 'teacher-1' || ownerGranted ? [grant] : [], teacherApproved: id !== 'teacher-1' || ownerApproved,
    })))

    await service.sendToClassroomManagers('classroom-1', 'broadcast:question', { questionIndex: 2 })

    expect(rooms).toHaveBeenCalledWith(['classroom:classroom-1:teacher', 'classroom:classroom-1:bigscreen'])
    expect(owner.emit).toHaveBeenCalledWith('broadcast:question', { questionIndex: 2 })
    expect(formerManager.emit).not.toHaveBeenCalled()
    expect(formerManager.disconnect).toHaveBeenCalledWith(true)
    expect(owner.data.userRole).toBe(UserRole.TEACHER)

    // Revoking the entry grant does not revoke the owner's teacher identity.
    ownerGranted = false
    await service.sendToClassroomManagers('classroom-1', 'broadcast:stats', {})
    expect(owner.emit).toHaveBeenLastCalledWith('broadcast:stats', {})
    expect(owner.disconnect).not.toHaveBeenCalled()

    // An unapproved owner must lose the business socket even with an entry grant.
    ownerGranted = true
    ownerApproved = false
    await service.sendToClassroomManagers('classroom-1', 'broadcast:stats', { private: true })
    expect(owner.emit).toHaveBeenCalledTimes(2)
    expect(owner.disconnect).toHaveBeenCalledWith(true)
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
      service.sendToClassroomManagers('classroom-1', 'broadcast:stats', {})
    ).resolves.toBeUndefined()

    expect(remoteSocket.emit).not.toHaveBeenCalled()
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

    await service.sendToClassroomManagers('classroom-1', 'broadcast:stats', {})

    expect(remoteSocket.emit).not.toHaveBeenCalled()
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

    await service.sendToClassroomManagers('classroom-1', 'broadcast:stats', {})

    expect(remoteSocket.data.platformRole).toBe('STANDARD')
    expect(remoteSocket.disconnect).not.toHaveBeenCalled()
    expect(remoteSocket.emit).toHaveBeenCalledWith('broadcast:stats', {})
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

    await service.sendToClassroomManagers('classroom-1', 'broadcast:stats', {})

    expect(remoteSocket.emit).not.toHaveBeenCalled()
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

    await service.sendToClassroomManagers('classroom-1', 'broadcast:stats', {})

    expect(remoteSocket.emit).not.toHaveBeenCalled()
    expect(remoteSocket.disconnect).toHaveBeenCalledWith(true)
  })
})
