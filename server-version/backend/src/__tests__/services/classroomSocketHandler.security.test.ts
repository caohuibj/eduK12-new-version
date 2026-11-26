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
    sendToClassroomManagers: vi.fn(),
    refreshAuthenticatedSocket: vi.fn(),
  },
  mockPrisma: {
    classroom: { findUnique: vi.fn(), update: vi.fn() },
    classroomQuestion: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    classroomSession: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    classroomAnswer: { findUnique: vi.fn(), create: vi.fn(), createMany: vi.fn(), count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn().mockResolvedValue(1),
  },
  mockFindClassroomAccess: vi.fn(),
  mockCanManageClassroom: vi.fn(),
  mockLookupLimit: vi.fn(),
  mockFailedLimit: vi.fn(),
}))

vi.mock('../../services/classroomDanmaku', async (original) => {
 const actual=await original<typeof import('../../services/classroomDanmaku')>();return {...actual,classroomDanmaku:{control:vi.fn(),send:vi.fn(),read:vi.fn().mockRejectedValue(new actual.DanmakuError('UNAVAILABLE','test cache offline')),close:vi.fn().mockResolvedValue({}),unavailable:vi.fn().mockReturnValue({available:false,messages:[]})}}
})

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
import {classroomDanmaku,DanmakuError,DANMAKU_LIMITS} from '../../services/classroomDanmaku'

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

const questionContentWithAnswers = {
  type: 'single_choice',
  question: 'Choose a public option',
  options: [
    { value: 'A', label: 'Alpha', isCorrect: true, score: 10 },
    { key: 'B', text: 'Beta', correctAnswer: 'A', scoring: { points: 0 } },
    { value: { correctAnswer: 'nested-key' }, label: { scoring: 'private' }, text: 'Public text' },
  ],
  correctAnswer: 'A',
  scoring: { answerKey: 'A', points: 10 },
  explanation: 'Private answer explanation',
}
const participantQuestionContent = {
  type: 'single_choice',
  question: 'Choose a public option',
  options: [{ value: 'A', label: 'Alpha' }, { key: 'B', text: 'Beta' }, { text: 'Public text' }],
}

describe('classroom socket authorization boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async callback=>callback(mockPrisma))
    mockSocketService.getClassroomNamespace.mockReturnValue(mockNamespace)
    mockSocketService.sendToClassroomManagers.mockResolvedValue(undefined)
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
    expect(mockPrisma.classroomAnswer.createMany).not.toHaveBeenCalled()
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
    expect(mockPrisma.classroomAnswer.createMany).not.toHaveBeenCalled()
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
    mockPrisma.classroomSession.upsert.mockResolvedValue(session)
    mockPrisma.classroomQuestion.findFirst.mockResolvedValue(null)

    await firstHandlers.get('student:join')!({ code: '123456' })

    const joinedCall = firstSocket.emit.mock.calls.find(
      ([event]: [string]) => event === 'student:joined'
    )
    const resumeToken = joinedCall?.[1]?.resumeToken
    expect(typeof resumeToken).toBe('string')
    expect(mockPrisma.classroomSession.upsert).toHaveBeenCalledOnce()

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
      message: '需要经过认证的教师连接',
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
    expect(mockPrisma.classroomAnswer.createMany).not.toHaveBeenCalled()
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

    expect(mockSocketService.sendToClassroomManagers).toHaveBeenCalledWith(
      'classroom-1', 'broadcast:stats', expect.any(Object)
    )
    expect(mockSocketService.broadcastToRoom).not.toHaveBeenCalled()
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
    mockPrisma.classroomAnswer.createMany.mockResolvedValue({ count: 1 })
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
    expect(mockPrisma.classroomAnswer.createMany).toHaveBeenCalledOnce()
  })

  it('revalidates a current authenticated student before an ownership-bound submit', async () => {
    const handler = new ClassroomSocketHandler()
    const socket = makeSocket({ authenticated: true, userId: 'student-1', userRole: 'STUDENT',
      clientRole: 'student', classroomId: 'classroom-1', sessionId: 'session-1', studentId: 'student-1' })
    mockPrisma.classroom.findUnique.mockResolvedValue({ status: 'ACTIVE' })
    mockPrisma.classroomQuestion.findFirst.mockResolvedValue({ id: 'question-1', startedAt: new Date(), endedAt: null, timeLimit: null })
    mockPrisma.classroomSession.findFirst.mockResolvedValue({ id: 'session-1' })
    mockPrisma.classroomAnswer.findUnique.mockResolvedValue(null)
    mockPrisma.classroomAnswer.createMany.mockResolvedValue({ count: 1 })
    await (handler as any).handleStudentSubmit(socket, { questionId: 'question-1', answer: 'A' })
    expect(mockSocketService.refreshAuthenticatedSocket).toHaveBeenCalledWith(socket)
    expect(mockPrisma.classroomSession.findFirst).toHaveBeenCalledWith({
      where: { id: 'session-1', classroomId: 'classroom-1', studentId: 'student-1' }, select: { id: true },
    })
    expect(mockPrisma.classroomAnswer.createMany).toHaveBeenCalledOnce()
  })

  it.each(['revoked', 'role-changed', 'different-student'])('rejects %s signed identity without downgrading later retries to anonymous', async reason => {
    const handler = new ClassroomSocketHandler()
    const socket = makeSocket({ authenticated: true, userId: 'student-1', userRole: 'STUDENT',
      clientRole: 'student', classroomId: 'classroom-1', sessionId: 'session-1', studentId: 'student-1' })
    mockSocketService.refreshAuthenticatedSocket.mockImplementation(async () => {
      if (reason === 'revoked') { socket.data.authenticated = false; socket.data.userId = undefined; return false }
      if (reason === 'role-changed') socket.data.userRole = 'TEACHER'
      if (reason === 'different-student') socket.data.userId = 'different-student'
      return true
    })
    await (handler as any).handleStudentSubmit(socket, { questionId: 'question-1', answer: 'A' })
    await (handler as any).handleStudentSubmit(socket, { questionId: 'question-1', answer: 'A' })
    // A leave/cleanup can clear classroom context, but cannot turn failed auth into anonymous join.
    socket.data.clientRole = undefined
    await (handler as any).handleStudentJoin(socket, { code: '123456' })
    expect(socket.data.authenticationInvalidated).toBe(reason === 'role-changed' ? undefined : true)
    expect(socket.disconnect).not.toHaveBeenCalled()
    expect(mockPrisma.classroom.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.classroomAnswer.createMany).not.toHaveBeenCalled()
    expect(mockPrisma.classroomSession.upsert).not.toHaveBeenCalled()
  })

  it('rejects an expired authenticated student before joining a classroom', async () => {
    const handler = new ClassroomSocketHandler()
    const socket = makeSocket({ authenticated: true, userId: 'student-1', userRole: 'STUDENT' })
    mockSocketService.refreshAuthenticatedSocket.mockResolvedValue(false)
    await (handler as any).handleStudentJoin(socket, { code: '123456' })
    expect(mockPrisma.classroom.findUnique).not.toHaveBeenCalled()
    expect(socket.data.authenticationInvalidated).toBe(true)
    expect(socket.disconnect).not.toHaveBeenCalled()
  })

  it('rejects a valid teacher on the student page without causing the client to reconnect', async () => {
    const handler = new ClassroomSocketHandler()
    const socket = makeSocket({ authenticated: true, userId: 'teacher-1', userRole: 'TEACHER' })
    await (handler as any).handleStudentJoin(socket, { code: '123456' })
    expect(socket.emit).toHaveBeenCalledWith('error', { message: '学生连接身份无效' })
    expect(socket.data.authenticationInvalidated).toBeUndefined()
    expect(socket.disconnect).not.toHaveBeenCalled()
    expect(mockPrisma.classroomSession.upsert).not.toHaveBeenCalled()
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
      $executeRaw: vi.fn().mockResolvedValue(1),
      classroom: { findUnique: vi.fn().mockResolvedValue({status:'PREPARING'}), update: vi.fn() },
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

  it('sends the joining student only their server-bound submission, never as a room broadcast', async () => {
    const handler = new ClassroomSocketHandler(); handler.initialize()
    const socket = makeSocket({ authenticated: true, userRole: 'STUDENT', userId: 'actual-student' })
    mockNamespace.on.mock.calls[0][1](socket)
    mockPrisma.classroom.findUnique.mockResolvedValue({ id: 'classroom-1', code: '123456', status: 'ACTIVE' })
    mockPrisma.classroomSession.upsert.mockResolvedValue({ id: 'bound-session', studentId: 'actual-student', leftAt: null })
    const submittedAt = new Date(), startedAt = new Date()
    mockPrisma.classroomQuestion.findFirst.mockResolvedValue({ id: 'question-1', questionContent: { type: 'single_choice' }, questionIndex: 1, timeLimit: 600, startedAt, answers: [{ answer: 'B', submittedAt }] })
    await getHandlers(socket).get('student:join')!({ code: '123456', studentId: 'forged-student', sessionId: 'forged-session' })
    expect(mockPrisma.classroomQuestion.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ answers: { where: { sessionId: 'bound-session' }, select: { answer: true, submittedAt: true } } }),
    }))
    expect(socket.emit).toHaveBeenCalledWith('broadcast:question', expect.objectContaining({ mySubmission: { answer: 'B', submittedAt }, startedAt: startedAt.toISOString() }))
    expect(JSON.stringify(mockSocketService.broadcastToRoom.mock.calls)).not.toContain('mySubmission')
  })

  it.each([false, true])('projects public question fields for an authenticated=%s student join', async authenticated => {
    const handler = new ClassroomSocketHandler()
    const studentId = authenticated ? 'actual-student' : 'temp_student'
    const socket = makeSocket(authenticated
      ? { authenticated, userRole: 'STUDENT', userId: studentId }
      : { authenticated })
    const startedAt = new Date()
    const submittedAt = new Date()
    const ownSubmission = { answer: 'B', submittedAt }
    mockPrisma.classroom.findUnique.mockResolvedValue({ id: 'classroom-1', code: '123456', status: 'ACTIVE' })
    mockPrisma.classroomSession.upsert.mockResolvedValue({ id: 'bound-session', studentId, leftAt: null })
    mockPrisma.classroomQuestion.findFirst.mockResolvedValue({
      id: 'question-1', questionContent: questionContentWithAnswers, questionIndex: 1,
      timeLimit: 600, startedAt, answers: [ownSubmission],
    })

    await (handler as any).handleStudentJoin(socket, { code: '123456' })

    expect(socket.join).toHaveBeenCalledWith('classroom:classroom-1:students')
    expect(socket.emit).toHaveBeenCalledWith('student:joined', expect.objectContaining({ classroomId: 'classroom-1' }))
    const question = socket.emit.mock.calls.find(([event]) => event === 'broadcast:question')?.[1]
    expect(question).toEqual({
      questionId: 'question-1', questionContent: participantQuestionContent,
      questionIndex: 1, timeLimit: 600, startedAt: startedAt.toISOString(),
      remainingTime: expect.any(Number), mySubmission: ownSubmission,
    })
    expect(JSON.stringify(question)).not.toMatch(/correctAnswer|scoring|isCorrect|nested-key|Private answer/)
    expect(mockSocketService.broadcastToRoom.mock.calls.filter(([, event]) => event === 'broadcast:question')).toEqual([])
  })

  it.each(['socket', 'notification'])('projects participant content on the %s start path while preserving manager snapshots', async path => {
    const handler = new ClassroomSocketHandler()
    const schedule = vi.spyOn(handler as any, 'scheduleQuestionTimer').mockImplementation(() => {})
    const startedAt = new Date('2026-10-04T12:00:00.000Z')
    const question = {
      id: 'question-1', questionContent: questionContentWithAnswers, questionIndex: 1,
      timeLimit: 60, startedAt, endedAt: null,
    }
    const managerQuestion = {
      questionId: question.id, questionContent: questionContentWithAnswers,
      questionIndex: 1, timeLimit: 60, startedAt: startedAt.toISOString(), endedAt: null,
    }
    const ack = vi.fn()
    if (path === 'socket') {
      const classroom = { id: 'classroom-1', status: 'PREPARING', creatorId: 'teacher-1' }
      const socket = makeSocket({ authenticated: true, userId: 'teacher-1', userRole: 'TEACHER',
        classroomId: classroom.id, clientRole: 'teacher' })
      mockFindClassroomAccess.mockResolvedValue(classroom)
      mockPrisma.classroom.findUnique.mockResolvedValue({ status: 'PREPARING' })
      mockPrisma.classroomQuestion.findFirst.mockReset()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...question, classroomId: classroom.id, startedAt: null })
      mockPrisma.classroomQuestion.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.classroomQuestion.findUnique.mockResolvedValue(question)

      await (handler as any).handleTeacherStart(socket, { questionId: question.id, timeLimit: 60 }, ack)

      expect(ack).toHaveBeenCalledWith({ ok: true, started: true, question: managerQuestion })
    } else {
      await handler.notifyQuestionStarted('classroom-1', question)
    }

    expect(mockSocketService.broadcastToRoom.mock.calls).toEqual([
      ['classroom:classroom-1:students', 'broadcast:question', {
        ...managerQuestion, questionContent: participantQuestionContent,
      }],
    ])
    expect(mockSocketService.sendToClassroomManagers).toHaveBeenCalledWith('classroom-1', 'broadcast:question', managerQuestion)
    expect(schedule).toHaveBeenCalledWith('classroom-1', question.id, 60, startedAt)
    expect(question.questionContent).toEqual(questionContentWithAnswers)
    expect(question.questionContent.correctAnswer).toBe('A')
  })

  it.each(['teacher', 'bigscreen'])('retains the authorized %s join snapshot and feedback contract', async role => {
    const handler = new ClassroomSocketHandler()
    vi.spyOn(handler as any, 'startManagerRevalidation').mockImplementation(() => {})
    vi.spyOn(handler as any, 'buildStats').mockResolvedValue({ questionId: 'question-1', answerCount: 1 })
    const socket = makeSocket({ authenticated: true, userId: 'teacher-1', userRole: 'TEACHER' })
    mockFindClassroomAccess.mockResolvedValue({ id: 'classroom-1', status: 'ACTIVE', creatorId: 'teacher-1' })
    mockPrisma.classroomQuestion.findFirst.mockResolvedValue({
      id: 'question-1', questionContent: questionContentWithAnswers, questionIndex: 1,
      timeLimit: 600, startedAt: new Date(), endedAt: null,
    })

    await (handler as any)[role === 'teacher' ? 'handleTeacherJoin' : 'handleBigscreenJoin'](socket, { classroomId: 'classroom-1' })

    expect(socket.join).toHaveBeenCalledWith('classroom:classroom-1:' + role)
    expect(socket.emit).toHaveBeenCalledWith(role + ':joined', expect.objectContaining({
      currentQuestion: expect.objectContaining({ questionContent: questionContentWithAnswers }),
      ...(role === 'bigscreen' ? { stats: { questionId: 'question-1', answerCount: 1 } } : {}),
    }))
  })

})


describe('danmaku socket admission and committed-state broadcast',()=>{
 const snapshot={available:true,classroomId:'classroom-1',sessionId:'danmaku-session',revision:3,controlRevision:1,displayEpoch:1,enabled:true,paused:false,displayMode:'QUESTION' as const,reviewMode:'review' as const,topic:'主题',speed:'normal' as const,expiresAt:null,messages:[{id:'approved',text:'公开',createdAt:'',expiresAt:'',status:'approved' as const}],pending:[{id:'pending',text:'待审',createdAt:'',expiresAt:'',status:'pending' as const}],limits:DANMAKU_LIMITS}
 const manager=()=>makeSocket({authenticated:true,userRole:'TEACHER',userId:'teacher-1',classroomId:'classroom-1',clientRole:'teacher'})
 const student=()=>makeSocket({authenticated:false,classroomId:'classroom-1',clientRole:'student',studentId:'temp_bound',sessionId:'bound-session'})
 beforeEach(()=>{
  vi.clearAllMocks();mockSocketService.refreshAuthenticatedSocket.mockResolvedValue(true)
  mockCanManageClassroom.mockReturnValue(true);mockFindClassroomAccess.mockResolvedValue({id:'classroom-1',status:'PREPARING',creatorId:'teacher-1',course:{creatorId:'teacher-1'}})
  mockPrisma.classroomSession.findFirst.mockResolvedValue({id:'bound-session'})
  vi.mocked(classroomDanmaku.read).mockResolvedValue({ok:true,snapshot})
  vi.mocked(classroomDanmaku.control).mockResolvedValue({ok:true,snapshot})
  vi.mocked(classroomDanmaku.send).mockResolvedValue({ok:true,snapshot,messageId:'approved',status:'approved',replayed:false})
 })
 it('ignores forged non-function ACK arguments and preserves ordinary omitted/function ACKs',async()=>{
  mockSocketService.getClassroomNamespace.mockReturnValue(mockNamespace)
  const handler=new ClassroomSocketHandler() as any,socket=makeSocket({})
  const events=[['danmaku:state:get','handleDanmakuRead'],['teacher:danmaku:control','handleDanmakuControl'],['student:danmaku:send','handleDanmakuSend']]
  const spies=events.map(([,method])=>vi.spyOn(handler,method).mockResolvedValue(undefined))
  handler.initialize();mockNamespace.on.mock.calls.find(([event])=>event==='connection')![1](socket)
  events.forEach(([event],index)=>{
   const listener=socket.on.mock.calls.find(([name])=>name===event)![1],spy=spies[index]
   for(const forged of ['bogus',null,42,{}])listener({},forged)
   expect(spy).not.toHaveBeenCalled()
   listener({});expect(spy).toHaveBeenCalledOnce()
   const ack=vi.fn();listener({},ack);expect(spy).toHaveBeenCalledTimes(2)
   expect(spy.mock.calls[1].at(-1)).toBe(ack)
  })
 })
 it('rejects unjoined and departed students without reading Redis',async()=>{
  const handler=new ClassroomSocketHandler() as any,ack=vi.fn()
  await handler.handleDanmakuRead(makeSocket({}),ack);expect(ack).toHaveBeenLastCalledWith(expect.objectContaining({code:'FORBIDDEN'}))
  mockPrisma.classroomSession.findFirst.mockResolvedValue(null)
  await handler.handleDanmakuSend(student(),{},ack);expect(ack).toHaveBeenLastCalledWith(expect.objectContaining({code:'FORBIDDEN'}))
  expect(classroomDanmaku.send).not.toHaveBeenCalled();expect(classroomDanmaku.read).not.toHaveBeenCalled()
 })
 it('reads use bound active session and never disclose any peer text to students',async()=>{
  const handler=new ClassroomSocketHandler() as any,ack=vi.fn()
  await handler.handleDanmakuRead(student(),ack)
  expect(mockPrisma.classroomSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:'bound-session',studentId:'temp_bound',classroomId:'classroom-1',leftAt:null})}))
  expect(ack).toHaveBeenCalledWith({ok:true,snapshot:expect.objectContaining({messages:[]})})
  expect(ack.mock.calls[0][0].snapshot).not.toHaveProperty('pending')
 })
 it('bigscreen and revoked managers cannot control; ended classes cannot restart',async()=>{
  const handler=new ClassroomSocketHandler() as any,ack=vi.fn(),screen=manager();screen.data.clientRole='bigscreen'
  await handler.handleDanmakuControl(screen,{},ack);expect(ack).toHaveBeenLastCalledWith(expect.objectContaining({code:'FORBIDDEN'}))
  mockCanManageClassroom.mockReturnValue(false);await handler.handleDanmakuControl(manager(),{},ack)
  expect(ack).toHaveBeenLastCalledWith(expect.objectContaining({code:'FORBIDDEN'}));expect(classroomDanmaku.control).not.toHaveBeenCalled()
  mockCanManageClassroom.mockReturnValue(true);mockFindClassroomAccess.mockResolvedValue({id:'classroom-1',status:'ENDED'})
  await handler.handleDanmakuControl(manager(),{},ack);expect(ack).toHaveBeenLastCalledWith(expect.objectContaining({code:'CLASSROOM_CLOSED'}))
 })
 it('committed teacher controls still broadcast when requester changes role before ACK',async()=>{
  const handler=new ClassroomSocketHandler() as any,socket=manager(),ack=vi.fn(),schedule=vi.spyOn(handler,'scheduleDanmaku').mockImplementation(()=>{})
  vi.mocked(classroomDanmaku.control).mockImplementation(async()=>{socket.data.clientRole='bigscreen';return {ok:true,snapshot}})
  await handler.handleDanmakuControl(socket,{},ack)
  expect(schedule).toHaveBeenCalledWith('classroom-1',true,true)
  expect(ack).toHaveBeenCalledWith(expect.objectContaining({ok:false,code:'FORBIDDEN'}))
 })
 it('committed student sends still broadcast but no success ACK goes to a departed context',async()=>{
  const handler=new ClassroomSocketHandler() as any,socket=student(),ack=vi.fn(),schedule=vi.spyOn(handler,'scheduleDanmaku').mockImplementation(()=>{})
  vi.mocked(classroomDanmaku.send).mockImplementation(async()=>{socket.data.sessionId='different-session';return {ok:true,snapshot,messageId:'approved',status:'approved',replayed:false}})
  await handler.handleDanmakuSend(socket,{},ack)
  expect(schedule).toHaveBeenCalledWith('classroom-1',false,true);expect(ack).toHaveBeenCalledWith(expect.objectContaining({ok:false,code:'FORBIDDEN'}))
 })
 it('read post-Redis role changes withhold pending; Redis failures advertise unavailable',async()=>{
  const handler=new ClassroomSocketHandler() as any,socket=manager(),ack=vi.fn()
  vi.mocked(classroomDanmaku.read).mockImplementation(async()=>{socket.data.clientRole='bigscreen';return {ok:true,snapshot}})
  await handler.handleDanmakuRead(socket,ack);expect(ack).toHaveBeenLastCalledWith(expect.objectContaining({ok:false,code:'FORBIDDEN'}))
  vi.mocked(classroomDanmaku.read).mockRejectedValue(new DanmakuError('UNAVAILABLE','缓存不可用'))
  const schedule=vi.spyOn(handler,'scheduleDanmaku').mockImplementation(()=>{})
  const second=manager();await handler.handleDanmakuRead(second,ack)
  expect(second.emit).toHaveBeenCalledWith('danmaku:state',expect.objectContaining({available:false}))
  expect(ack).toHaveBeenLastCalledWith(expect.objectContaining({ok:false,code:'UNAVAILABLE'}))
  expect(schedule).toHaveBeenCalledWith('classroom-1',true)
 })
 it('coalesces simultaneous failed sends into one outage broadcast and recovers a quiet classroom',async()=>{
  vi.useFakeTimers()
  try{
   const handler=new ClassroomSocketHandler() as any,ack=vi.fn()
   const error=new DanmakuError('UNAVAILABLE','test cache offline')
   vi.mocked(classroomDanmaku.send).mockRejectedValue(error)
   vi.mocked(classroomDanmaku.read).mockRejectedValueOnce(error)
   await Promise.all(Array.from({length:200},()=>handler.handleDanmakuSend(student(),{},ack)))
   expect(ack).toHaveBeenCalledTimes(200)
   expect(mockSocketService.sendToClassroomManagers).not.toHaveBeenCalled()
   await vi.advanceTimersByTimeAsync(250)
   expect(classroomDanmaku.read).toHaveBeenCalledTimes(1)
   expect(mockSocketService.sendToClassroomManagers).toHaveBeenCalledTimes(1)
   expect(mockSocketService.broadcastToRoom).toHaveBeenCalledTimes(1)
   expect(mockSocketService.broadcastToRoom).toHaveBeenLastCalledWith('classroom:classroom-1:students','danmaku:state',expect.objectContaining({available:false,messages:[]}))
   await vi.advanceTimersByTimeAsync(6000)
   expect(classroomDanmaku.read).toHaveBeenCalledTimes(2)
   expect(mockSocketService.sendToClassroomManagers).toHaveBeenCalledTimes(2)
   expect(mockSocketService.broadcastToRoom).toHaveBeenCalledTimes(2)
   expect(mockSocketService.broadcastToRoom).toHaveBeenLastCalledWith('classroom:classroom-1:students','danmaku:state',expect.objectContaining({available:true,messages:[]}))
   expect(mockSocketService.broadcastToRoom.mock.calls[1][2]).not.toHaveProperty('pending')
   expect(handler.danmakuBatches.size).toBe(0)
   await vi.advanceTimersByTimeAsync(60_000)
   expect(classroomDanmaku.read).toHaveBeenCalledTimes(2)
  }finally{vi.clearAllTimers();vi.useRealTimers()}
 })
 it('does not poll a persistent outage or repeat the unavailable fan-out without new demand',async()=>{
  vi.useFakeTimers()
  try{
   const handler=new ClassroomSocketHandler() as any
   const error=new DanmakuError('UNAVAILABLE','test cache offline')
   vi.mocked(classroomDanmaku.read).mockRejectedValue(error)
   handler.scheduleDanmaku('classroom-1',true)
   await vi.advanceTimersByTimeAsync(250)
   await vi.advanceTimersByTimeAsync(6000)
   await vi.advanceTimersByTimeAsync(60_000)
   expect(classroomDanmaku.read).toHaveBeenCalledTimes(2)
   expect(mockSocketService.sendToClassroomManagers).toHaveBeenCalledTimes(1)
   expect(mockSocketService.broadcastToRoom).toHaveBeenCalledTimes(1)
   expect(handler.danmakuBatches.size).toBe(0)
  }finally{vi.clearAllTimers();vi.useRealTimers()}
 })
 it('keeps one fan-out in flight and merges new work into a following batch',async()=>{
  vi.useFakeTimers()
  try{
   const handler=new ClassroomSocketHandler() as any
   let release!:()=>void
   mockSocketService.sendToClassroomManagers.mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve}))
   handler.scheduleDanmaku('classroom-1',false,true)
   await vi.advanceTimersByTimeAsync(250)
   expect(classroomDanmaku.read).toHaveBeenCalledTimes(1)
   for(let i=0;i<200;i++)handler.scheduleDanmaku('classroom-1',true)
   await vi.advanceTimersByTimeAsync(1000)
   expect(classroomDanmaku.read).toHaveBeenCalledTimes(1)
   expect(mockSocketService.sendToClassroomManagers).toHaveBeenCalledTimes(1)
   release()
   await vi.advanceTimersByTimeAsync(0)
   await vi.advanceTimersByTimeAsync(250)
   expect(classroomDanmaku.read).toHaveBeenCalledTimes(2)
   expect(mockSocketService.sendToClassroomManagers).toHaveBeenCalledTimes(2)
   expect(mockSocketService.broadcastToRoom).toHaveBeenCalledTimes(1)
   expect(handler.danmakuBatches.size).toBe(0)
  }finally{vi.clearAllTimers();vi.useRealTimers()}
 })
 it('propagates an explicit teacher refresh even on a node with no remembered outage',async()=>{
  vi.useFakeTimers()
  try{
   const handler=new ClassroomSocketHandler() as any,ack=vi.fn()
   await handler.handleDanmakuRead(manager(),ack)
   expect(ack).toHaveBeenCalledWith(expect.objectContaining({ok:true}))
   await vi.advanceTimersByTimeAsync(250)
   expect(mockSocketService.sendToClassroomManagers).toHaveBeenCalledTimes(1)
   expect(mockSocketService.broadcastToRoom).toHaveBeenCalledWith('classroom:classroom-1:students','danmaku:state',expect.objectContaining({available:true,messages:[]}))
  }finally{vi.clearAllTimers();vi.useRealTimers()}
 })
 it('reconciles a committed send whose first ACK was lost when the same message ID is retried',async()=>{
  vi.useFakeTimers()
  try{
   const handler=new ClassroomSocketHandler() as any,ack=vi.fn()
   vi.mocked(classroomDanmaku.send).mockResolvedValue({ok:true,snapshot,messageId:'approved',status:'approved',replayed:true})
   await handler.handleDanmakuSend(student(),{},ack)
   expect(ack).toHaveBeenCalledWith(expect.objectContaining({ok:true,messageId:'approved'}))
   await vi.advanceTimersByTimeAsync(250)
   expect(mockSocketService.sendToClassroomManagers).toHaveBeenCalledTimes(1)
   expect(mockSocketService.broadcastToRoom).toHaveBeenCalledTimes(1)
  }finally{vi.clearAllTimers();vi.useRealTimers()}
 })
})
