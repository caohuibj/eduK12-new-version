import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockCheckinTokenService } = vi.hoisted(() => ({
  mockPrisma: {
    checkin: { findUnique: vi.fn() },
    storedAsset: { findMany: vi.fn() },
    checkinSubmission: { findUnique: vi.fn(), create: vi.fn() },
    assetReference: { findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  mockCheckinTokenService: {
    validateToken: vi.fn(),
    createSessionCapability: vi.fn(),
    verifySessionCapability: vi.fn(),
    claimSubmissionSlot: vi.fn(),
  },
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../services/checkinTokenService', () => ({ checkinTokenService: mockCheckinTokenService }))

import { checkinController } from '../../controllers/checkinController'

const makeRes = () => {
  const res: any = { statusCode: 200, body: null }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: unknown) => {
    res.body = body
    return res
  })
  return res
}

const makeRequest = (body: unknown, headers: Record<string, string | undefined> = {}) => ({
  params: { token: 'ck_abcdefghijklmnop' },
  body,
  header: vi.fn((name: string) => headers[name]),
})

describe('public check-in session capability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckinTokenService.validateToken.mockResolvedValue({
      valid: true,
      token: { id: 'token-1', expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      checkin: { id: 'checkin-1', courseId: 'course-1', endTime: null },
    })
    mockCheckinTokenService.createSessionCapability.mockReturnValue({
      sessionId: 'session_abcdefghijklmnop',
      capability: 'v1.1234567890.server-issued-capability',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    })
    mockCheckinTokenService.verifySessionCapability.mockReturnValue(true)
    mockCheckinTokenService.claimSubmissionSlot.mockResolvedValue(true)
    mockPrisma.$executeRaw.mockResolvedValue(0)
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => unknown) => callback(mockPrisma))
  })

  it('returns a server-issued capability with the public check-in session', async () => {
    mockPrisma.checkin.findUnique.mockResolvedValue({
      id: 'checkin-1',
      title: '公开签到',
      description: null,
      content: null,
      images: [],
      videos: [],
      documents: [],
      endTime: null,
      createdAt: new Date(),
      allowViewOthers: false,
      courseId: 'course-1',
    })
    const response = makeRes()

    await checkinController.getPublicCheckin(
      makeRequest(undefined, {}),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(response.body.data.sessionId).toBe('session_abcdefghijklmnop')
    expect(response.body.data.sessionCapability).toBe('v1.1234567890.server-issued-capability')
    expect(mockCheckinTokenService.createSessionCapability).toHaveBeenCalledWith({
      checkinId: 'checkin-1',
      tokenId: 'token-1',
      tokenExpiresAt: expect.any(Date),
    })
  })

  it('rejects a correctly formatted but forged session ID without its capability', async () => {
    mockCheckinTokenService.verifySessionCapability.mockReturnValue(false)
    const response = makeRes()

    await checkinController.submitPublicCheckin(
      makeRequest({
        content: 'anonymous response',
        images: [],
        sessionId: 'session_aaaaaaaaaaaaaaaa',
      }, {
        'X-Checkin-Token': 'ck_abcdefghijklmnop',
        'X-Checkin-Session-Capability': 'forged-capability',
      }),
      response,
    )

    expect(response.statusCode).toBe(401)
    expect(response.body.message).toBe('匿名签到会话凭据无效')
    expect(mockCheckinTokenService.verifySessionCapability).toHaveBeenCalledWith(expect.objectContaining({
      checkinId: 'checkin-1',
      tokenId: 'token-1',
      sessionId: 'session_aaaaaaaaaaaaaaaa',
      capability: 'forged-capability',
    }))
    expect(mockPrisma.storedAsset.findMany).not.toHaveBeenCalled()
  })

  it('serializes a valid submission under the session lock', async () => {
    mockPrisma.storedAsset.findMany.mockResolvedValue([{ id: 'asset-1' }])
    mockPrisma.checkinSubmission.findUnique.mockResolvedValue(null)
    mockPrisma.checkinSubmission.create.mockResolvedValue({ id: 'submission-1' })
    mockPrisma.assetReference.upsert.mockResolvedValue({})
    const response = makeRes()

    await checkinController.submitPublicCheckin(
      makeRequest({
        content: 'anonymous response',
        images: [{ assetId: 'asset-1' }],
        sessionId: 'session_abcdefghijklmnop',
      }, {
        'X-Checkin-Token': 'ck_abcdefghijklmnop',
        'X-Checkin-Session-Capability': 'server-issued-capability',
      }),
      response,
    )

    expect(response.statusCode).toBe(200)
    expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce()
    expect(mockCheckinTokenService.claimSubmissionSlot).toHaveBeenCalledWith('token-1', mockPrisma)
    expect(mockPrisma.assetReference.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        entityType: 'CheckinUploadSession',
        entityId: 'checkin-1:session_abcdefghijklmnop',
      }),
    }))
  })

  it('does not claim another slot or allow a duplicate session upload path', async () => {
    mockPrisma.checkinSubmission.findUnique.mockResolvedValue({ id: 'submission-1' })
    const response = makeRes()

    await checkinController.submitPublicCheckin(
      makeRequest({
        content: 'duplicate response',
        images: [],
        sessionId: 'session_abcdefghijklmnop',
      }, {
        'X-Checkin-Token': 'ck_abcdefghijklmnop',
        'X-Checkin-Session-Capability': 'server-issued-capability',
      }),
      response,
    )

    expect(response.statusCode).toBe(400)
    expect(response.body.message).toBe('您已经提交过了')
    expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce()
    expect(mockCheckinTokenService.claimSubmissionSlot).not.toHaveBeenCalled()
  })
})
