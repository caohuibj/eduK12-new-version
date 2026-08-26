import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockNamespace,
  mockSocketService,
  mockPrisma,
  mockFindClassroomAccess,
  mockCanManageClassroom,
  mockLookupLimit,
  mockFailedLimit,
} = vi.hoisted(() => ({
  mockNamespace: { on: vi.fn() },
  mockSocketService: {
    getClassroomNamespace: vi.fn(),
    broadcastToRoom: vi.fn(),
    getRoomConnectionCount: vi.fn(),
  },
  mockPrisma: {
    classroom: { findUnique: vi.fn() },
    classroomQuestion: { findFirst: vi.fn(), updateMany: vi.fn() },
    classroomSession: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    classroomAnswer: { findUnique: vi.fn(), create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  },
  mockFindClassroomAccess: vi.fn(),
  mockCanManageClassroom: vi.fn(),
  mockLookupLimit: vi.fn(),
  mockFailedLimit: vi.fn(),
}))

vi.mock('../../services/socketService', () => ({
  socketService: mockSocketService,
}))
vi.mock('../../config/database', () => ({
  prisma: mockPrisma,
}))
vi.mock('../../services/statsAggregator', () => ({
  StatsAggregator: vi.fn(),
}))
vi.mock('../../middleware/classroomAccess', () => ({
  findClassroomAccess: mockFindClassroomAccess,
  canManageClassroom: mockCanManageClassroom,
}))
vi.mock('../../utils/classroomRateLimiter', () => ({
  checkClassroomLookupRateLimit: mockLookupLimit,
  checkFailedClassroomCodeRateLimit: mockFailedLimit,
}))

import { ClassroomSocketHandler } from '../../services/classroomSocketHandler'

const makeSocket = (data: Record<string, unknown>) => ({
  data,
  on: vi.fn(),
  emit: vi.fn(),
  join: vi.fn(),
  leave: vi.fn(),
  handshake: { address: '127.0.0.1' },
  conn: { remoteAddress: '127.0.0.1' },
})

const getHandlers = (socket: any) =>
  new Map<string, (data?: unknown) => Promise<void>>(
    socket.on.mock.calls.map(([event, handler]: [string, (data?: unknown) => Promise<void>]) => [
      event,
      handler,
    ])
  )

describe('classroom socket authorization boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSocketService.getClassroomNamespace.mockReturnValue(mockNamespace)
    mockLookupLimit.mockResolvedValue({
      available: true,
      allowed: true,
      remaining: 59,
      retryAfterSeconds: 60,
    })
    mockFailedLimit.mockResolvedValue({
      available: true,
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 60,
    })
  })

  it('rejects an unauthenticated teacher action without a database write or broadcast', async () => {
    const handler = new ClassroomSocketHandler()
    handler.initialize()
    const connect = mockNamespace.on.mock.calls[0][1]
    const socket = makeSocket({ authenticated: false })
    connect(socket)
    const handlers = getHandlers(socket)

    await handlers.get('teacher:start')!({ classroomId: 'classroom-1', questionId: 'question-1' })

    expect(socket.emit).toHaveBeenCalledWith('error', {
      message: '请先加入课堂',
    })
    expect(mockPrisma.classroomQuestion.updateMany).not.toHaveBeenCalled()
    expect(mockPrisma.classroomAnswer.create).not.toHaveBeenCalled()
    expect(mockSocketService.broadcastToRoom).not.toHaveBeenCalled()
  })

  it('rejects a forged student session before writing an answer', async () => {
    const handler = new ClassroomSocketHandler()
    handler.initialize()
    const connect = mockNamespace.on.mock.calls[0][1]
    const socket = makeSocket({
      authenticated: false,
      clientRole: 'student',
      classroomId: 'classroom-1',
      sessionId: 'server-session',
      studentId: 'server-student',
    })
    connect(socket)
    const handlers = getHandlers(socket)

    mockPrisma.classroom.findUnique.mockResolvedValue({ status: 'ACTIVE' })
    mockPrisma.classroomQuestion.findFirst.mockResolvedValue({
      id: 'question-1',
      startedAt: new Date(),
      endedAt: null,
      timeLimit: null,
    })
    mockPrisma.classroomSession.findFirst.mockResolvedValue(null)

    await handlers.get('student:submit')!({
      classroomId: 'classroom-other',
      questionId: 'question-1',
      sessionId: 'forged-session',
      answer: 'answer',
    })

    expect(socket.emit).toHaveBeenCalledWith('error', {
      message: '课堂会话无效',
    })
    expect(mockPrisma.classroomAnswer.create).not.toHaveBeenCalled()
    expect(mockSocketService.broadcastToRoom).not.toHaveBeenCalled()
  })
})
