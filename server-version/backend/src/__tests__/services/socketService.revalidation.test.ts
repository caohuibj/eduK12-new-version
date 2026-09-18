import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '../../types'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    $queryRaw: vi.fn(),
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { SocketService } from '../../services/socketService'

const makeRemoteSocket = (data: Record<string, unknown>) => ({
  data,
  disconnect: vi.fn(),
})

const principalRow = (overrides: Record<string, unknown> = {}) => [{
  id: 'teacher-1',
  username: 'teacher-1',
  role: UserRole.TEACHER,
  platformRole: 'STANDARD',
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
