import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockPrisma,
  mockLookupLimit,
  mockFailedLimit,
} = vi.hoisted(() => ({
  mockPrisma: {
    classroom: { findUnique: vi.fn() },
    classroomQuestion: { findFirst: vi.fn() },
    classroomAnswer: { count: vi.fn(), findMany: vi.fn() },
    classroomSession: { count: vi.fn() },
  },
  mockLookupLimit: vi.fn(),
  mockFailedLimit: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../middleware/classroomAccess', () => ({
  userCanManageClassroom: vi.fn(),
}))
vi.mock('../../utils/classroomRateLimiter', () => ({
  checkClassroomLookupRateLimit: mockLookupLimit,
  checkFailedClassroomCodeRateLimit: mockFailedLimit,
}))
vi.mock('../../services/statsAggregator', () => ({
  StatsAggregator: vi.fn(),
}))

import { classroomController } from '../../controllers/classroomController'

const makeReq = (code: string) => ({
  params: { code },
  ip: '127.0.0.1',
  socket: { remoteAddress: '127.0.0.1' },
}) as any

const makeRes = () => {
  const res: any = { statusCode: 200, body: null }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.set = vi.fn()
  res.json = vi.fn((body: any) => {
    res.body = body
    return res
  })
  return res
}

const available = {
  available: true,
  allowed: true,
  remaining: 59,
  retryAfterSeconds: 60,
}

describe('public classroom code boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLookupLimit.mockResolvedValue(available)
    mockFailedLimit.mockResolvedValue({
      ...available,
      remaining: 4,
    })
  })

  it('returns only the minimum join summary', async () => {
    mockPrisma.classroom.findUnique.mockResolvedValue({
      id: 'classroom-1',
      code: '123456',
      name: '公开课堂',
      status: 'ACTIVE',
      course: { id: 'course-1', title: '课程' },
      creator: { id: 'teacher-1', nickname: '不应返回' },
      questions: [{ id: 'question-1' }],
    })
    const res = makeRes()

    await classroomController.getByCode(makeReq('123456'), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.data).toEqual({
      id: 'classroom-1',
      code: '123456',
      name: '公开课堂',
      status: 'ACTIVE',
      course: { id: 'course-1', title: '课程' },
    })
    expect(res.body.data).not.toHaveProperty('creator')
    expect(res.body.data).not.toHaveProperty('questions')
  })

  it('uses a uniform not-found response for an ended classroom', async () => {
    mockPrisma.classroom.findUnique.mockResolvedValue({
      id: 'classroom-1',
      code: '123456',
      name: '已结束',
      status: 'ENDED',
      course: { id: 'course-1', title: '课程' },
    })
    const res = makeRes()

    await classroomController.getByCode(makeReq('123456'), res)

    expect(res.statusCode).toBe(404)
    expect(res.body.message).toBe('课堂不存在或当前不可加入')
    expect(mockFailedLimit).toHaveBeenCalledOnce()
  })

  it('fails closed when the IP limit cannot be checked', async () => {
    mockLookupLimit.mockResolvedValue({
      available: false,
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    })
    const res = makeRes()

    await classroomController.getByCode(makeReq('123456'), res)

    expect(res.statusCode).toBe(503)
    expect(mockPrisma.classroom.findUnique).not.toHaveBeenCalled()
  })

  it('does not reveal whether an invalid code is well formed', async () => {
    const res = makeRes()

    await classroomController.getByCode(makeReq('bad'), res)

    expect(res.statusCode).toBe(404)
    expect(res.body.message).toBe('课堂不存在或当前不可加入')
    expect(mockPrisma.classroom.findUnique).not.toHaveBeenCalled()
    expect(mockFailedLimit).toHaveBeenCalledWith('127.0.0.1', 'bad')
  })

  it('normalizes wrapped and multi-select answers in historical stats', async () => {
    mockPrisma.classroomQuestion.findFirst.mockResolvedValue({
      id: 'question-1',
      classroomId: 'classroom-1',
      questionIndex: 1,
      timeLimit: 60,
      questionContent: {
        type: 'multiple_choice',
        options: [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }],
      },
    })
    mockPrisma.classroomAnswer.count.mockResolvedValue(2)
    mockPrisma.classroomSession.count.mockResolvedValue(2)
    mockPrisma.classroomAnswer.findMany.mockResolvedValue([
      { answer: { value: ['A', 'B'] } },
      { answer: { value: 'A,B' } },
    ])
    const res = makeRes()

    await classroomController.getQuestionStats({ params: { classroomId: 'classroom-1', questionId: 'question-1' } } as any, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.data.stats.optionStats).toEqual({ A: 2, B: 2 })
    expect(res.body.data.stats.unsupportedType).toBe(false)
  })
})
