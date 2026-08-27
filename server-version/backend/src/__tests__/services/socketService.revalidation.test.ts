import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '../../types'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { SocketService } from '../../services/socketService'

const makeRemoteSocket = (data: Record<string, unknown>) => ({
  data,
  disconnect: vi.fn(),
})

describe('SocketService manager room revalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('disconnects a manager whose account is no longer active', async () => {
    const remoteSocket = makeRemoteSocket({
      authenticated: true,
      userId: 'teacher-1',
      userRole: UserRole.TEACHER,
      tokenVersion: 0,
    })
    const service = new SocketService()
    const fetchSockets = vi.fn().mockResolvedValue([remoteSocket])
    ;(service as any).classroomNamespace = {
      in: vi.fn().mockReturnValue({ fetchSockets }),
    }
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'teacher-1',
      role: UserRole.TEACHER,
      isActive: false,
      isFrozen: false,
      expiresAt: null,
      teacherApproved: true,
      tokenVersion: 0,
    })

    await expect(
      service.revalidateManagerSockets('classroom:classroom-1:teacher')
    ).resolves.toBe(true)

    expect(remoteSocket.disconnect).toHaveBeenCalledWith(true)
  })

  it('disconnects a socket whose role was downgraded', async () => {
    const remoteSocket = makeRemoteSocket({
      authenticated: true,
      userId: 'teacher-1',
      userRole: UserRole.TEACHER,
      tokenVersion: 0,
    })
    const service = new SocketService()
    ;(service as any).classroomNamespace = {
      in: vi.fn().mockReturnValue({
        fetchSockets: vi.fn().mockResolvedValue([remoteSocket]),
      }),
    }
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'teacher-1',
      role: UserRole.STUDENT,
      isActive: true,
      isFrozen: false,
      expiresAt: null,
      teacherApproved: true,
      tokenVersion: 0,
    })

    await service.revalidateManagerSockets('classroom:classroom-1:teacher')

    expect(remoteSocket.disconnect).toHaveBeenCalledWith(true)
  })

  it('disconnects a socket whose token version was revoked', async () => {
    const remoteSocket = makeRemoteSocket({
      authenticated: true,
      userId: 'teacher-1',
      userRole: UserRole.TEACHER,
      tokenVersion: 0,
    })
    const service = new SocketService()
    ;(service as any).classroomNamespace = {
      in: vi.fn().mockReturnValue({
        fetchSockets: vi.fn().mockResolvedValue([remoteSocket]),
      }),
    }
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'teacher-1',
      role: UserRole.TEACHER,
      isActive: true,
      isFrozen: false,
      expiresAt: null,
      teacherApproved: true,
      tokenVersion: 1,
    })

    await service.revalidateManagerSockets('classroom:classroom-1:teacher')

    expect(remoteSocket.disconnect).toHaveBeenCalledWith(true)
  })

  it('disconnects a socket that still has a temporary password', async () => {
    const remoteSocket = makeRemoteSocket({
      authenticated: true,
      userId: 'teacher-1',
      userRole: UserRole.TEACHER,
      tokenVersion: 0,
    })
    const service = new SocketService()
    ;(service as any).classroomNamespace = {
      in: vi.fn().mockReturnValue({
        fetchSockets: vi.fn().mockResolvedValue([remoteSocket]),
      }),
    }
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'teacher-1',
      role: UserRole.TEACHER,
      isActive: true,
      isFrozen: false,
      expiresAt: null,
      teacherApproved: true,
      tokenVersion: 0,
      mustChangePassword: true,
    })

    await service.revalidateManagerSockets('classroom:classroom-1:teacher')

    expect(remoteSocket.disconnect).toHaveBeenCalledWith(true)
  })
})
