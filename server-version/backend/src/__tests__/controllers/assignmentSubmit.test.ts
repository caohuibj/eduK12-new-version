import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssignmentStatus, UserRole } from '@prisma/client'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    assignment: { findUnique: vi.fn() },
    courseStudent: { findFirst: vi.fn() },
    submission: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    submissionHistory: { findFirst: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { assignmentController } from '../../controllers/assignmentController'
import { Messages } from '../../constants'
import { hashIdempotencyKey, hashIdempotencyPayload } from '../../utils/idempotency'

const makeReq = (overrides: any = {}) => ({
  user: { userId: 'student-1', username: 's1', role: UserRole.STUDENT },
  body: { content: 'done' },
  params: { id: 'asg-1' },
  query: {},
  ...overrides,
})

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

describe('assignment submit deadline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.courseStudent.findFirst.mockResolvedValue({ id: 'membership-1' })
  })

  it('rejects a new submit after the deadline', async () => {
    mockPrisma.assignment.findUnique.mockResolvedValue({
      id: 'asg-1',
      courseId: 'course-1',
      status: AssignmentStatus.PUBLISHED,
      deadline: new Date(Date.now() - 60_000),
    })
    const res = makeRes()

    await assignmentController.submit(makeReq(), res)

    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe(Messages.ASSIGNMENT.DEADLINE_PASSED)
    expect(mockPrisma.submission.create).not.toHaveBeenCalled()
  })

  it('rejects a resubmit after the deadline', async () => {
    mockPrisma.assignment.findUnique.mockResolvedValue({
      id: 'asg-1',
      courseId: 'course-1',
      status: AssignmentStatus.PUBLISHED,
      deadline: new Date(Date.now() - 60_000),
    })
    mockPrisma.submission.findFirst.mockResolvedValue({ id: 'sub-1', content: 'old', answers: {} })
    const res = makeRes()

    await assignmentController.submit(makeReq(), res)

    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe(Messages.ASSIGNMENT.DEADLINE_PASSED)
    expect(mockPrisma.submission.update).not.toHaveBeenCalled()
  })

  it('accepts a submit when no deadline is set', async () => {
    mockPrisma.assignment.findUnique.mockResolvedValue({
      id: 'asg-1',
      courseId: 'course-1',
      status: AssignmentStatus.PUBLISHED,
      deadline: null,
    })
    mockPrisma.submission.findFirst.mockResolvedValue(null)
    mockPrisma.submission.create.mockResolvedValue({ id: 'sub-1' })
    const res = makeRes()

    await assignmentController.submit(makeReq(), res)

    expect(res.body.code).toBe(0)
    expect(mockPrisma.submission.create).toHaveBeenCalledOnce()
  })

  it('returns an idempotent success for a retried request with the same key', async () => {
    mockPrisma.assignment.findUnique.mockResolvedValue({
      id: 'asg-1',
      courseId: 'course-1',
      status: AssignmentStatus.PUBLISHED,
      deadline: null,
    })
    mockPrisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      content: 'done',
      answers: {},
      idempotencyKeyHash: hashIdempotencyKey('assignment-retry-1'),
    })
    const res = makeRes()

    await assignmentController.submit(makeReq({
      header: vi.fn().mockReturnValue('assignment-retry-1'),
    }), res)

    expect(res.body.code).toBe(0)
    expect(mockPrisma.submissionHistory.create).not.toHaveBeenCalled()
    expect(mockPrisma.submission.update).not.toHaveBeenCalled()
  })

  it('rejects reusing a key for a changed payload', async () => {
    mockPrisma.assignment.findUnique.mockResolvedValue({
      id: 'asg-1',
      courseId: 'course-1',
      status: AssignmentStatus.PUBLISHED,
      deadline: null,
    })
    mockPrisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      content: 'answer A',
      answers: {},
      idempotencyKeyHash: hashIdempotencyKey('assignment-retry-1'),
      idempotencyPayloadHash: hashIdempotencyPayload({ content: 'answer A', answers: {} }),
    })
    const res = makeRes()

    await assignmentController.submit(makeReq({
      body: { content: 'answer B' },
      header: vi.fn().mockReturnValue('assignment-retry-1'),
    }), res)

    expect(res.statusCode).toBe(409)
    expect(res.body.message).toBe('Idempotency-Key 已用于其他提交内容')
    expect(mockPrisma.submission.update).not.toHaveBeenCalled()
    expect(mockPrisma.submissionHistory.create).not.toHaveBeenCalled()
  })

  it('rejects a student who is not a member of the assignment course', async () => {
    mockPrisma.courseStudent.findFirst.mockResolvedValue(null)
    mockPrisma.assignment.findUnique.mockResolvedValue({
      id: 'asg-1',
      courseId: 'course-1',
      status: AssignmentStatus.PUBLISHED,
      deadline: null,
    })
    const res = makeRes()

    await assignmentController.submit(makeReq(), res)

    expect(res.statusCode).toBe(403)
    expect(mockPrisma.submission.create).not.toHaveBeenCalled()
  })
})
