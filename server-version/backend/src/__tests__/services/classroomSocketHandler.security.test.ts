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
    revalidateManagerSockets: vi.fn(),
    refreshAuthenticatedSocket: vi.fn(),
  },
  mockPrisma: {
    classroom: { findUnique: vi.fn(), update: vi.fn() },
    classroomQuestion: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    classroomSession: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    classroomAnswer: { findUnique: vi.fn(), create: vi.fn(), count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
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
  disconnect: vi.fn(),
  handshake: { address: '127.0.0.1', headers: {} },
  conn: { remoteAddress: '127.0.0.1' },
})

const getHandlers = (socket: any) =>
  new Map<string, (data?: unknown) => Promise<void>>(
    socket.on.mock.calls.map(([event, handler]: [string, (data?: unknown) => void]) => [
      event,
      async (data?: unknown) => {
        handler(data)
        await new Promise<void>((resolve) => setImmediate(resolve))
      },
    ])
  )

describe('classroom socket authorization boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSocketService.getClassroomNamespace.mockReturnValue(mockNamespace)
    mockSocketService.revalidateManagerSockets.mockResolvedValue(true)
    mockSocketService.refreshAuthenticatedSocket.mockResolvedValue(true)
    mockCanManageClassroom.mockReturnValue(true)
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

  it('issues one resume token for an anonymous session and restores it', async () => {
    const handler = new ClassroomSocketHandler()
    handler.initialize()
    const connect = mockNamespace.on.mock.calls[0][1]
    const firstSocket = makeSocket({ authenticated: false })
    connect(firstSocket)
    const firstHandlers = getHandlers(firstSocket)
    const session = {
      id: 'session-1',
      classroomId: 'classroom-1',
      studentId: 'temp_student-1',
      leftAt: null,
      isTemporary: true,
    }

    mockPrisma.classroom.findUnique.mockResolvedValue({
      id: 'classroom-1',
      code: '123456',
      name: '课堂',
      status: 'ACTIVE',
    })
    mockPrisma.classroomSession.findUnique.mockResolvedValue(null)
    mockPrisma.classroomSession.create.mockResolvedValue(session)
    mockPrisma.classroomQuestion.findFirst.mockResolvedValue(null)

    await firstHandlers.get('student:join')!({ code: '123456' })

    const joinedCall = firstSocket.emit.mock.calls.find(
      ([event]: [string]) => event === 'student:joined'
    )
    const resumeToken = joinedCall?.[1]?.resumeToken
    expect(typeof resumeToken).toBe('string')
    expect(mockPrisma.classroomSession.create).toHaveBeenCalledOnce()

    vi.clearAllMocks()
    mockSocketService.getClassroomNamespace.mockReturnValue(mockNamespace)
    mockSocketService.refreshAuthenticatedSocket.mockResolvedValue(true)
    const secondSocket = makeSocket({ authenticated: false })
    connect(secondSocket)
    const secondHandlers = getHandlers(secondSocket)
    mockPrisma.classroom.findUnique.mockResolvedValue({
      id: 'classroom-1',
      code: '123456',
      name: '课堂',
      status: 'ACTIVE',
    })
    mockPrisma.classroomSession.findFirst.mockResolvedValue(session)
    mockPrisma.classroomQuestion.findFirst.mockResolvedValue(null)

    await secondHandlers.get('student:join')!({
      code: '123456',
      resumeToken,
    })

    expect(mockPrisma.classroomSession.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        classroomId: 'classroom-1',
        isTemporary: true,
      },
    })
    expect(mockPrisma.classroomSession.create).not.toHaveBeenCalled()
  })

  it('rejects an invalid anonymous resume token without creating a new session', async () => {
    const handler = new ClassroomSocketHandler()
    handler.initialize()
    const connect = mockNamespace.on.mock.calls[0][1]
    const socket = makeSocket({ authenticated: false })
    connect(socket)
    const handlers = getHandlers(socket)

    mockPrisma.classroom.findUnique.mockResolvedValue({
      id: 'classroom-1',
      code: '123456',
      name: '课堂',
      status: 'ACTIVE',
    })

    await handlers.get('student:join')!({
      code: '123456',
      resumeToken: 'forged-token',
    })

    expect(socket.emit).toHaveBeenCalledWith('error', {
      message: '学生会话无效',
    })
    expect(mockPrisma.classroomSession.findFirst).not.toHaveBeenCalled()
    expect(mockPrisma.classroomSession.create).not.toHaveBeenCalled()
  })

  it('refreshes the account before each manager action', async () => {
    const handler = new ClassroomSocketHandler()
    handler.initialize()
    const connect = mockNamespace.on.mock.calls[0][1]
    const socket = makeSocket({
      authenticated: true,
      userId: 'teacher-1',
      userRole: 'TEACHER',
      classroomId: 'classroom-1',
    })
    connect(socket)
    const handlers = getHandlers(socket)
    mockSocketService.refreshAuthenticatedSocket.mockResolvedValue(false)

    await handlers.get('teacher:next')!()

    expect(socket.emit).toHaveBeenCalledWith('error', {
      message: '需要经过认证的教师或管理员连接',
    })
    expect(mockFindClassroomAccess).not.toHaveBeenCalled()
    expect(mockSocketService.broadcastToRoom).not.toHaveBeenCalled()
  })

  it('rejects a forged session before expired-question side effects', async () => {
    const handler = new ClassroomSocketHandler()
    handler.initialize()
    const connect = mockNamespace.on.mock.calls[0][1]
    const socket = makeSocket({
      authenticated: false,
      clientRole: 'student',
      classroomId: 'classroom-1',
      sessionId: 'forged-session',
      studentId: 'forged-student',
    })
    connect(socket)
    const handlers = getHandlers(socket)

    mockPrisma.classroom.findUnique.mockResolvedValue({ status: 'ACTIVE' })
    mockPrisma.classroomQuestion.findFirst.mockResolvedValue({
      id: 'question-1',
      startedAt: new Date(Date.now() - 10_000),
      endedAt: null,
      timeLimit: 1,
    })
    mockPrisma.classroomSession.findFirst.mockResolvedValue(null)

    await handlers.get('student:submit')!({
      questionId: 'question-1',
      answer: 'answer',
    })

    expect(socket.emit).toHaveBeenCalledWith('error', {
      message: '课堂会话无效',
    })
    expect(mockPrisma.classroomQuestion.updateMany).not.toHaveBeenCalled()
    expect(mockPrisma.classroomAnswer.create).not.toHaveBeenCalled()
    expect(mockSocketService.broadcastToRoom).not.toHaveBeenCalled()
  })

  it('revalidates manager rooms before broadcasting answer statistics', async () => {
    const handler = new ClassroomSocketHandler()
    mockPrisma.classroomQuestion.findFirst.mockResolvedValue({
      id: 'question-1',
      questionContent: {},
    })
    mockPrisma.classroomAnswer.count.mockResolvedValue(0)
    mockPrisma.classroomSession.count.mockResolvedValue(0)

    await (handler as any).broadcastStats('classroom-1', 'question-1')

    expect(mockSocketService.revalidateManagerSockets).toHaveBeenNthCalledWith(
      1,
      'classroom:classroom-1:teacher'
    )
    expect(mockSocketService.revalidateManagerSockets).toHaveBeenNthCalledWith(
      2,
      'classroom:classroom-1:bigscreen'
    )
    expect(mockSocketService.broadcastToRoom).toHaveBeenCalledWith(
      'classroom:classroom-1:teacher',
      'broadcast:stats',
      expect.any(Object)
    )
  })

  it('does not require leftAt to be null for a server-bound student submit', async () => {
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

    const question = {
      id: 'question-1',
      startedAt: new Date(),
      endedAt: null,
      timeLimit: null,
      questionContent: {},
    }
    mockPrisma.classroom.findUnique.mockResolvedValue({ status: 'ACTIVE' })
    mockPrisma.classroomQuestion.findFirst.mockResolvedValue(question)
    mockPrisma.classroomSession.findFirst.mockResolvedValue({ id: 'server-session' })
    mockPrisma.classroomAnswer.findUnique.mockResolvedValue(null)
    mockPrisma.classroomAnswer.create.mockResolvedValue({ id: 'answer-1' })
    mockPrisma.classroomAnswer.count.mockResolvedValue(1)
    mockPrisma.classroomSession.count.mockResolvedValue(1)

    await handlers.get('student:submit')!({
      questionId: 'question-1',
      answer: 'answer',
    })

    expect(mockPrisma.classroomSession.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'server-session',
        classroomId: 'classroom-1',
        studentId: 'server-student',
      },
      select: { id: true },
    })
    expect(mockPrisma.classroomAnswer.create).toHaveBeenCalledOnce()
  })

  it('uses compare-and-set and returns the winning question for a same-question race', async () => {
    const handler = new ClassroomSocketHandler()
    const socket = makeSocket({
      authenticated: true,
      userId: 'teacher-1',
      userRole: 'TEACHER',
      classroomId: 'classroom-1',
    })
    const classroom = { id: 'classroom-1', status: 'PREPARING', creatorId: 'teacher-1' }
    const candidate = {
      id: 'question-1',
      classroomId: 'classroom-1',
      questionContent: { question: 'Q1' },
      questionIndex: 1,
      timeLimit: 60,
      startedAt: null,
      endedAt: null,
    }
    const winner = { ...candidate, startedAt: new Date('2026-08-28T00:00:00.000Z'), endedAt: null }
    const tx = {
      classroomQuestion: {
        findFirst: vi.fn().mockResolvedValueOnce(null),
        findUnique: vi.fn().mockResolvedValue(winner),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      classroom: { update: vi.fn() },
      classroomAnswer: { deleteMany: vi.fn() },
    }
    tx.classroomQuestion.findFirst.mockResolvedValueOnce(candidate)
    mockFindClassroomAccess.mockResolvedValue(classroom)
    mockPrisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
    const ack = vi.fn()

    await (handler as any).handleTeacherStart(socket, { questionId: 'question-1', timeLimit: 60 }, ack)

    expect(tx.classroomQuestion.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ startedAt: null, endedAt: null }),
    }))
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({
      ok: true,
      started: false,
      alreadyActive: true,
      question: expect.objectContaining({ questionId: 'question-1' }),
    }))
    expect(mockSocketService.broadcastToRoom).not.toHaveBeenCalled()
  })

})
