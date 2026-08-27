import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    checkin: { findUnique: vi.fn() },
    courseStudent: { findFirst: vi.fn() },
    checkinSubmission: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    storedAsset: { findMany: vi.fn() },
    assetReference: { deleteMany: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import { checkinController } from '../../controllers/checkinController'
import { Messages } from '../../constants'

const makeReq = (overrides: any = {}) => ({
  user: { userId: 'student-1', username: 's1', role: UserRole.STUDENT },
  body: { content: 'today' },
  params: { id: 'ck-1' },
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

describe('logged-in checkin submit endTime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.courseStudent.findFirst.mockResolvedValue({ id: 'membership-1' })
    mockPrisma.storedAsset.findMany.mockResolvedValue([])
    mockPrisma.assetReference.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.assetReference.upsert.mockResolvedValue({})
    mockPrisma.assetReference.findMany.mockResolvedValue([])
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma))
  })

  it('rejects a submit after endTime', async () => {
    mockPrisma.checkin.findUnique.mockResolvedValue({
      id: 'ck-1',
      courseId: 'course-1',
      endTime: new Date(Date.now() - 60_000),
    })
    const res = makeRes()

    await checkinController.submit(makeReq(), res)

    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe(Messages.CHECKIN.EXPIRED)
    expect(mockPrisma.checkinSubmission.create).not.toHaveBeenCalled()
  })

  it('rejects an update after endTime', async () => {
    mockPrisma.checkin.findUnique.mockResolvedValue({
      id: 'ck-1',
      courseId: 'course-1',
      endTime: new Date(Date.now() - 60_000),
    })
    mockPrisma.checkinSubmission.findFirst.mockResolvedValue({ id: 'sub-1' })
    const res = makeRes()

    await checkinController.submit(makeReq(), res)

    expect(res.statusCode).toBe(400)
    expect(mockPrisma.checkinSubmission.update).not.toHaveBeenCalled()
  })

  it('accepts a submit when endTime has not passed', async () => {
    mockPrisma.checkin.findUnique.mockResolvedValue({
      id: 'ck-1',
      courseId: 'course-1',
      endTime: new Date(Date.now() + 60_000),
    })
    mockPrisma.checkinSubmission.findFirst.mockResolvedValue(null)
    mockPrisma.checkinSubmission.create.mockResolvedValue({ id: 'sub-1' })
    const res = makeRes()

    await checkinController.submit(makeReq(), res)

    expect(res.body.code).toBe(0)
    expect(mockPrisma.checkinSubmission.create).toHaveBeenCalledOnce()
  })

  it('rejects a student who is not a member of the checkin course', async () => {
    mockPrisma.courseStudent.findFirst.mockResolvedValue(null)
    mockPrisma.checkin.findUnique.mockResolvedValue({
      id: 'ck-1',
      courseId: 'course-1',
      endTime: null,
    })
    const res = makeRes()

    await checkinController.submit(makeReq(), res)

    expect(res.statusCode).toBe(403)
    expect(mockPrisma.checkinSubmission.create).not.toHaveBeenCalled()
  })

  it('accepts an owned course-scoped asset id', async () => {
    mockPrisma.checkin.findUnique.mockResolvedValue({
      id: 'ck-1',
      courseId: 'course-1',
      endTime: null,
    })
    mockPrisma.checkinSubmission.findFirst.mockResolvedValue(null)
    mockPrisma.storedAsset.findMany.mockResolvedValue([{ id: 'asset-1' }])
    mockPrisma.assetReference.findMany.mockResolvedValue([{ assetId: 'asset-1' }])
    mockPrisma.checkinSubmission.create.mockResolvedValue({ id: 'sub-asset' })
    const res = makeRes()

    await checkinController.submit(makeReq({ body: { images: [{ assetId: 'asset-1' }] } }), res)

    expect(res.body.code).toBe(0)
    expect(mockPrisma.storedAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ['asset-1'] },
        ownerId: 'student-1',
        accessScope: 'COURSE',
        scopeId: 'course-1',
      }),
    }))
    expect(mockPrisma.assetReference.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ assetId: 'asset-1', entityId: 'sub-asset' }),
    }))
  })

  it('rejects an asset that is not owned by the submitting student', async () => {
    mockPrisma.checkin.findUnique.mockResolvedValue({
      id: 'ck-1',
      courseId: 'course-1',
      endTime: null,
    })
    mockPrisma.storedAsset.findMany.mockResolvedValue([])
    const res = makeRes()

    await checkinController.submit(makeReq({ body: { images: [{ assetId: 'other-student-asset' }] } }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('图片凭据无效或不属于当前课程')
    expect(mockPrisma.checkinSubmission.create).not.toHaveBeenCalled()
  })

  it('rejects traversal and external URL strings during the migration window', async () => {
    mockPrisma.checkin.findUnique.mockResolvedValue({
      id: 'ck-1',
      courseId: 'course-1',
      endTime: null,
    })
    const res = makeRes()

    await checkinController.submit(makeReq({ body: { images: ['../../etc/passwd'] } }), res)

    expect(res.statusCode).toBe(400)
    expect(res.body.message).toBe('图片引用无效')
    expect(mockPrisma.checkinSubmission.create).not.toHaveBeenCalled()
  })
})
