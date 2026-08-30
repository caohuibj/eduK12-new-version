import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    checkin: { findUnique: vi.fn() },
    courseStudent: { findFirst: vi.fn() },
    checkinSubmission: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    checkinSubmissionIdempotencyReceipt: { findFirst: vi.fn(), create: vi.fn() },
    storedAsset: { findMany: vi.fn() },
    assetReference: { deleteMany: vi.fn(), upsert: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))

import {
  checkinController,
  publicUploadStagingEntityId,
  stagePublicUploadAsset,
  validatePublicSubmissionImages,
  PublicUploadSessionAlreadySubmittedError,
} from '../../controllers/checkinController'
import { Messages } from '../../constants'
import { hashIdempotencyKey, hashIdempotencyPayload } from '../../utils/idempotency'

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
    mockPrisma.assetReference.count.mockResolvedValue(0)
    mockPrisma.checkinSubmission.findFirst.mockResolvedValue(null)
    mockPrisma.checkinSubmission.findUnique.mockResolvedValue(null)
    mockPrisma.checkinSubmissionIdempotencyReceipt.findFirst.mockResolvedValue(null)
    mockPrisma.$executeRaw.mockResolvedValue(0)
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

  it('returns 5xx for an unexpected write or hydration failure so a keyed retry is retained', async () => {
    mockPrisma.checkin.findUnique.mockResolvedValue({
      id: 'ck-1',
      courseId: 'course-1',
      endTime: null,
    })
    mockPrisma.checkinSubmission.findFirst.mockResolvedValue(null)
    mockPrisma.checkinSubmission.findUnique.mockResolvedValue(null)
    mockPrisma.checkinSubmission.create.mockRejectedValue(new Error('database unavailable'))
    const res = makeRes()

    await checkinController.submit(makeReq({
      header: vi.fn().mockReturnValue('checkin-server-error'),
    }), res)

    expect(res.statusCode).toBe(500)
  })

  it('returns an idempotent success for a retried request with the same key', async () => {
    mockPrisma.checkin.findUnique.mockResolvedValue({
      id: 'ck-1',
      courseId: 'course-1',
      endTime: null,
    })
    mockPrisma.checkinSubmission.findUnique.mockResolvedValue({
      id: 'sub-1',
      content: 'today',
      images: [],
      idempotencyKeyHash: hashIdempotencyKey('checkin-retry-1'),
    })
    const res = makeRes()

    await checkinController.submit(makeReq({
      header: vi.fn().mockReturnValue('checkin-retry-1'),
    }), res)

    expect(res.body.code).toBe(0)
    expect(mockPrisma.checkinSubmission.create).not.toHaveBeenCalled()
    expect(mockPrisma.checkinSubmission.update).not.toHaveBeenCalled()
  })

  it('rejects reusing a key for a changed payload', async () => {
    mockPrisma.checkin.findUnique.mockResolvedValue({
      id: 'ck-1',
      courseId: 'course-1',
      endTime: null,
    })
    mockPrisma.checkinSubmission.findUnique.mockResolvedValue({
      id: 'sub-1',
      content: 'today A',
      images: [],
      idempotencyKeyHash: hashIdempotencyKey('checkin-retry-1'),
      idempotencyPayloadHash: hashIdempotencyPayload({ content: 'today A', images: [] }),
    })
    const res = makeRes()

    await checkinController.submit(makeReq({
      body: { content: 'today B' },
      header: vi.fn().mockReturnValue('checkin-retry-1'),
    }), res)

    expect(res.statusCode).toBe(409)
    expect(res.body.message).toBe('Idempotency-Key 已用于其他提交内容')
    expect(mockPrisma.checkinSubmission.update).not.toHaveBeenCalled()
    expect(mockPrisma.checkinSubmission.create).not.toHaveBeenCalled()
  })

  it('replays an older key from its immutable receipt after a newer submit', async () => {
    const oldKeyHash = hashIdempotencyKey('checkin-old-key')
    mockPrisma.checkin.findUnique.mockResolvedValue({
      id: 'ck-1',
      courseId: 'course-1',
      endTime: null,
    })
    mockPrisma.checkinSubmissionIdempotencyReceipt.findFirst.mockResolvedValue({
      idempotencyKeyHash: oldKeyHash,
      idempotencyPayloadHash: hashIdempotencyPayload({ content: 'today A', images: [] }),
      response: {
        id: 'sub-1',
        checkinId: 'ck-1',
        studentId: 'student-1',
        content: 'today A',
        images: [],
      },
    })
    mockPrisma.checkinSubmission.findFirst.mockResolvedValue({
      id: 'sub-1',
      content: 'today B',
      images: [],
      idempotencyKeyHash: hashIdempotencyKey('checkin-new-key'),
      idempotencyPayloadHash: hashIdempotencyPayload({ content: 'today B', images: [] }),
    })
    const res = makeRes()

    await checkinController.submit(makeReq({
      body: { content: 'today A' },
      header: vi.fn().mockReturnValue('checkin-old-key'),
    }), res)

    expect(res.body.code).toBe(0)
    expect(res.body.data.content).toBe('today A')
    expect(mockPrisma.checkinSubmission.update).not.toHaveBeenCalled()
    expect(mockPrisma.checkinSubmission.create).not.toHaveBeenCalled()
  })

  it('re-checks the receipt inside the transaction after a delayed retry acquires the lock', async () => {
    const oldKeyHash = hashIdempotencyKey('checkin-delayed-key')
    const receipt = {
      idempotencyKeyHash: oldKeyHash,
      idempotencyPayloadHash: hashIdempotencyPayload({ content: 'today A', images: [] }),
      response: { id: 'sub-1', content: 'today A', images: [] },
    }
    mockPrisma.checkin.findUnique.mockResolvedValue({
      id: 'ck-1',
      courseId: 'course-1',
      endTime: null,
    })
    mockPrisma.checkinSubmissionIdempotencyReceipt.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(receipt)
    mockPrisma.checkinSubmission.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        id: 'sub-1',
        content: 'today B',
        images: [],
        idempotencyKeyHash: hashIdempotencyKey('checkin-new-key'),
      })
    const res = makeRes()

    await checkinController.submit(makeReq({
      body: { content: 'today A' },
      header: vi.fn().mockReturnValue('checkin-delayed-key'),
    }), res)

    expect(res.body.code).toBe(0)
    expect(res.body.data.content).toBe('today A')
    expect(mockPrisma.checkinSubmission.update).not.toHaveBeenCalled()
    expect(mockPrisma.checkinSubmission.create).not.toHaveBeenCalled()
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

  it('binds anonymous image credentials to the exact upload session', async () => {
    mockPrisma.storedAsset.findMany.mockResolvedValue([{ id: 'asset-1' }])
    const sessionId = 'session_abcdefghijklmnop'

    const images = await validatePublicSubmissionImages(
      [{ assetId: 'asset-1' }],
      'ck-1',
      sessionId,
    )

    expect(images).toEqual([{ assetId: 'asset-1' }])
    expect(mockPrisma.storedAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        references: {
          some: {
            entityType: 'CheckinUploadSession',
            entityId: publicUploadStagingEntityId('ck-1', sessionId),
            field: 'staging',
          },
        },
      }),
    }))
  })

  it('rejects uploads after the session has already submitted', async () => {
    mockPrisma.checkinSubmission.findUnique.mockResolvedValue({ id: 'submission-1' })

    await expect(stagePublicUploadAsset({
      assetId: 'asset-1',
      checkinId: 'ck-1',
      sessionId: 'session_abcdefghijklmnop',
      db: mockPrisma as any,
    })).rejects.toBeInstanceOf(PublicUploadSessionAlreadySubmittedError)

    expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce()
    expect(mockPrisma.assetReference.count).not.toHaveBeenCalled()
    expect(mockPrisma.assetReference.upsert).not.toHaveBeenCalled()
  })

  it('checks the submitted state and image cap while holding the session lock', async () => {
    mockPrisma.assetReference.count.mockResolvedValue(8)

    await stagePublicUploadAsset({
      assetId: 'asset-1',
      checkinId: 'ck-1',
      sessionId: 'session_abcdefghijklmnop',
      db: mockPrisma as any,
    })

    expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce()
    expect(mockPrisma.checkinSubmission.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { checkinId_sessionId: { checkinId: 'ck-1', sessionId: 'session_abcdefghijklmnop' } },
    }))
    expect(mockPrisma.assetReference.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ entityId: 'ck-1:session_abcdefghijklmnop' }),
    }))
    expect(mockPrisma.assetReference.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        assetId: 'asset-1',
        entityType: 'CheckinUploadSession',
        entityId: 'ck-1:session_abcdefghijklmnop',
        field: 'staging',
      }),
    }))
  })
})
