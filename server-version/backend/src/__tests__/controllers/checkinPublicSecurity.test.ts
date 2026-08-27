import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma, mockCheckinTokenService } = vi.hoisted(() => ({
  mockPrisma: {
    checkin: { findUnique: vi.fn() },
    storedAsset: { findMany: vi.fn() },
    assetReference: { findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
  },
  mockCheckinTokenService: {
    validateToken: vi.fn(),
    createSessionCapability: vi.fn(),
    verifySessionCapability: vi.fn(),
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
})
