import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const { mockPrisma, mockCheckinValidate, mockCheckinVerifySession } = vi.hoisted(() => ({
  mockPrisma: {
    storedAsset: { findUnique: vi.fn(), findMany: vi.fn() },
    course: { findUnique: vi.fn() },
    assetReference: { findMany: vi.fn(), findFirst: vi.fn() },
  },
  mockCheckinValidate: vi.fn(),
  mockCheckinVerifySession: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../config', () => ({
  config: {
    uploadDir: '/tmp/eduk12-asset-storage-test',
    jwtSecret: 'asset-storage-test-secret-with-more-than-32-chars',
    assetSigningSecret: 'asset-signing-test-secret-with-more-than-32-chars',
  },
}))
vi.mock('../../utils/cos', () => ({
  getCOSSignedUrl: vi.fn(),
  isCOSEnabled: vi.fn(() => false),
  uploadBufferToCOS: vi.fn(),
}))
vi.mock('../../services/checkinTokenService', () => ({
  checkinTokenService: {
    validateToken: mockCheckinValidate,
    verifySessionCapability: mockCheckinVerifySession,
  },
}))

import {
  assetStorageInternals,
  issuePrivateAssetUrl,
  issuePublicAssetUrl,
  serveAsset,
  hydrateAssetReferences,
} from '../../services/assetStorage'

const makeRes = () => {
  const headers = new Map<string, string>()
  let finish: () => void = () => undefined
  const finished = new Promise<void>((resolve) => { finish = resolve })
  const res: any = { statusCode: 200, body: null, headers, finished }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: unknown) => {
    res.body = body
    return res
  })
  res.redirect = vi.fn((code: number, url: string) => {
    res.statusCode = code
    res.redirectUrl = url
    return res
  })
  res.setHeader = vi.fn((name: string, value: string) => headers.set(name, value))
  res.on = vi.fn().mockReturnValue(res)
  res.once = vi.fn().mockReturnValue(res)
  res.emit = vi.fn().mockReturnValue(true)
  res.write = vi.fn().mockReturnValue(true)
  res.end = vi.fn(() => { finish(); return res })
  return res
}

const privateAsset = (overrides: Record<string, unknown> = {}) => ({
  id: 'asset-1',
  objectKey: 'assets/asset-1.pdf',
  provider: 'local',
  mimeType: 'application/pdf',
  sizeBytes: 10,
  originalName: 'report.pdf',
  ownerId: 'teacher-1',
  accessScope: 'PRIVATE',
  scopeId: null,
  deletedAt: null,
  ...overrides,
})

const request = (overrides: Record<string, unknown> = {}) => ({
  params: { id: 'asset-1' },
  user: { userId: 'teacher-1', role: UserRole.TEACHER },
  query: {},
  baseUrl: '/api/assets',
  header: vi.fn((name: string) => name === 'X-Checkin-Token' ? 'checkin-token' : undefined),
  ...overrides,
})

describe('stored asset access boundary', () => {
  const assetPath = path.join('/tmp/eduk12-asset-storage-test', 'assets', 'asset-1.pdf')

  beforeAll(() => {
    fs.mkdirSync(path.dirname(assetPath), { recursive: true })
    fs.writeFileSync(assetPath, 'test asset')
  })

  afterAll(() => {
    fs.rmSync('/tmp/eduk12-asset-storage-test', { recursive: true, force: true })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.storedAsset.findUnique.mockResolvedValue(privateAsset())
    mockPrisma.course.findUnique.mockResolvedValue(null)
    mockPrisma.assetReference.findFirst.mockResolvedValue(null)
    mockCheckinVerifySession.mockReturnValue(true)
  })

  it('issues a short-lived URL only to the asset owner', async () => {
    const res = makeRes()

    await issuePrivateAssetUrl(request(), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.data.assetId).toBe('asset-1')
    expect(res.body.data.expiresIn).toBe(600)
    expect(res.body.data.url).toContain('/api/assets/asset-1/content')
  })

  it('rejects a private asset request from another user', async () => {
    const res = makeRes()

    await issuePrivateAssetUrl(request({ user: { userId: 'student-1', role: UserRole.STUDENT } }), res)

    expect(res.statusCode).toBe(403)
    expect(res.body.message).toBe('无权限访问此文件')
  })

  it('allows a course member but not an unrelated user to read a course asset', async () => {
    mockPrisma.storedAsset.findUnique.mockResolvedValue(privateAsset({
      ownerId: null,
      accessScope: 'COURSE',
      scopeId: 'course-1',
    }))
    mockPrisma.course.findUnique.mockResolvedValue({ creatorId: 'teacher-1', students: [] })
    const ownerResponse = makeRes()

    await issuePrivateAssetUrl(request(), ownerResponse)
    expect(ownerResponse.statusCode).toBe(200)

    const unrelatedResponse = makeRes()
    await issuePrivateAssetUrl(request({ user: { userId: 'student-2', role: UserRole.STUDENT } }), unrelatedResponse)
    expect(unrelatedResponse.statusCode).toBe(403)
  })

  it('requires the matching check-in token and server-issued session for staged assets', async () => {
    mockPrisma.storedAsset.findUnique.mockResolvedValue(privateAsset({
      ownerId: null,
      accessScope: 'PUBLIC_CHECKIN',
      scopeId: 'checkin-1',
    }))
    mockCheckinValidate.mockResolvedValue({
      valid: true,
      token: { id: 'token-1', expiresAt: new Date(Date.now() + 60_000) },
      checkin: { id: 'checkin-1', courseId: 'course-1' },
    })
    mockPrisma.assetReference.findFirst.mockResolvedValue({ id: 'staging-reference-1' })
    const sessionId = 'session_abcdefghijklmnop'
    const sessionHeaders: Record<string, string> = {
      'X-Checkin-Token': 'checkin-token',
      'X-Checkin-Session-Id': sessionId,
      'X-Checkin-Session-Capability': 'server-issued-capability',
    }
    const publicRequest = request({
      user: undefined,
      header: vi.fn((name: string) => sessionHeaders[name]),
    })
    const res = makeRes()

    await issuePublicAssetUrl(publicRequest, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.data.url).toContain('/api/public/assets/asset-1/content')
    expect(mockCheckinVerifySession).toHaveBeenCalledWith(expect.objectContaining({
      checkinId: 'checkin-1',
      tokenId: 'token-1',
      sessionId,
      capability: 'server-issued-capability',
    }))
    expect(mockPrisma.assetReference.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        entityType: 'CheckinUploadSession',
        entityId: `checkin-1:${sessionId}`,
        field: 'staging',
      }),
    }))

    mockCheckinVerifySession.mockReturnValue(false)
    const crossSessionResponse = makeRes()
    await issuePublicAssetUrl(publicRequest, crossSessionResponse)
    expect(crossSessionResponse.statusCode).toBe(401)
  })

  it('does not expose a submitted anonymous asset through the shared check-in token', async () => {
    mockPrisma.storedAsset.findUnique.mockResolvedValue(privateAsset({
      ownerId: null,
      accessScope: 'PUBLIC_CHECKIN',
      scopeId: 'checkin-1',
    }))
    mockCheckinValidate.mockResolvedValue({
      valid: true,
      token: { id: 'token-1', expiresAt: new Date(Date.now() + 60_000) },
      checkin: { id: 'checkin-1', courseId: 'course-1' },
    })
    // A submitted asset has only a CheckinSubmission reference, not the
    // short-lived CheckinUploadSession staging reference.
    mockPrisma.assetReference.findFirst.mockResolvedValue(null)

    const response = makeRes()
    await issuePublicAssetUrl(request({ user: undefined }), response)

    expect(response.statusCode).toBe(401)
    expect(mockCheckinVerifySession).not.toHaveBeenCalled()
  })

  it('allows a public token to read a course-scoped asset referenced by that check-in', async () => {
    mockPrisma.storedAsset.findUnique.mockResolvedValue(privateAsset({
      ownerId: 'teacher-1',
      accessScope: 'COURSE',
      scopeId: 'course-1',
    }))
    mockCheckinValidate.mockResolvedValue({
      valid: true,
      checkin: { id: 'checkin-1', courseId: 'course-1' },
    })
    mockPrisma.assetReference.findFirst.mockResolvedValue({ id: 'reference-1' })
    const res = makeRes()

    await issuePublicAssetUrl(request({ user: undefined }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.data.url).toContain('/api/public/assets/asset-1/content')
    expect(mockPrisma.assetReference.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        assetId: 'asset-1',
        entityType: 'Checkin',
        entityId: 'checkin-1',
      }),
    }))
  })

  it('does not issue public check-in assets through the private URL endpoint', async () => {
    const publicAsset = privateAsset({
      ownerId: 'teacher-1',
      accessScope: 'PUBLIC_CHECKIN',
      scopeId: 'checkin-1',
    })
    mockPrisma.storedAsset.findUnique.mockResolvedValue(publicAsset)

    const issueResponse = makeRes()
    await issuePrivateAssetUrl(request(), issueResponse)
    expect(issueResponse.statusCode).toBe(403)
  })

  it('serves an anonymous submission asset through an authorized private hydration capability', async () => {
    const publicAsset = privateAsset({
      ownerId: null,
      accessScope: 'PUBLIC_CHECKIN',
      scopeId: 'checkin-1',
    })
    mockPrisma.storedAsset.findMany.mockResolvedValue([{
      id: 'asset-1',
      accessScope: 'PUBLIC_CHECKIN',
      scopeId: 'checkin-1',
    }])
    mockPrisma.assetReference.findMany.mockResolvedValue([{ assetId: 'asset-1' }])

    const hydrated = await hydrateAssetReferences({ images: [{ assetId: 'asset-1' }] }, false, {
      entityType: 'CheckinSubmission',
      entityId: 'submission-1',
      checkinId: 'checkin-1',
      courseId: 'course-1',
      parentAccess: true,
    }) as { images: Array<{ url: string }> }
    const privateUrl = new URL(hydrated.images[0].url, 'http://localhost')

    mockPrisma.storedAsset.findUnique.mockResolvedValue(publicAsset)
    const contentResponse = makeRes()
    await serveAsset(request({ query: Object.fromEntries(privateUrl.searchParams) }), contentResponse)
    await contentResponse.finished

    expect(contentResponse.statusCode).toBe(200)
  })

  it('hydrates teacher check-in media on the public route when the scope and reference match', async () => {
    mockPrisma.storedAsset.findMany.mockResolvedValue([{
      id: 'asset-1',
      accessScope: 'COURSE',
      scopeId: 'course-1',
    }])
    mockPrisma.assetReference.findMany.mockResolvedValue([{ assetId: 'asset-1' }])

    const hydrated = await hydrateAssetReferences({ images: [{ assetId: 'asset-1' }] }, true, {
      entityType: 'Checkin',
      entityId: 'checkin-1',
      checkinId: 'checkin-1',
      courseId: 'course-1',
      parentAccess: true,
    }) as { images: Array<{ url: string }> }

    expect(hydrated.images[0].url).toContain('/api/public/assets/asset-1/content')
  })

  it('does not allow a course asset from another course on the public route', async () => {
    mockPrisma.storedAsset.findMany.mockResolvedValue([{
      id: 'asset-1',
      accessScope: 'COURSE',
      scopeId: 'other-course',
    }])
    mockPrisma.assetReference.findMany.mockResolvedValue([{ assetId: 'asset-1' }])

    const hydrated = await hydrateAssetReferences({ images: [{ assetId: 'asset-1' }] }, true, {
      entityType: 'Checkin',
      entityId: 'checkin-1',
      checkinId: 'checkin-1',
      courseId: 'course-1',
      parentAccess: true,
    }) as { images: Array<{ url: string | null }> }

    expect(hydrated.images[0].url).toBeNull()
  })

  it('rejects invalid or expired signed content URLs', async () => {
    const res = makeRes()

    await serveAsset(request({ query: { expires: String(Math.floor(Date.now() / 1000) - 1), signature: 'invalid' } }), res)

    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('文件访问签名无效或已过期')
    expect(mockPrisma.storedAsset.findUnique).not.toHaveBeenCalled()
  })

  it('generates signatures that are bound to the asset and expiry', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60
    const signed = assetStorageInternals.signedPath('asset-1', expiresAt)
    const url = new URL(signed, 'http://localhost')

    expect(url.searchParams.get('expires')).toBe(String(expiresAt))
    expect(url.searchParams.get('signature')).toMatch(/^[A-Za-z0-9_-]{40,100}$/)
    expect(assetStorageInternals.signedPath('asset-2', expiresAt)).not.toBe(signed)
  })

  it('binds signed content URLs to their public/private audience', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60
    const privateUrl = new URL(assetStorageInternals.signedPath('asset-1', expiresAt), 'http://localhost')
    const publicRouteResponse = makeRes()

    await serveAsset(request({
      baseUrl: '/api/public/assets',
      query: Object.fromEntries(privateUrl.searchParams),
    }), publicRouteResponse)

    expect(publicRouteResponse.statusCode).toBe(401)
    expect(mockPrisma.storedAsset.findUnique).not.toHaveBeenCalled()

    const publicUrl = new URL(assetStorageInternals.signedPath('asset-1', expiresAt, true), 'http://localhost')
    const privateRouteResponse = makeRes()
    await serveAsset(request({ query: Object.fromEntries(publicUrl.searchParams) }), privateRouteResponse)

    expect(privateRouteResponse.statusCode).toBe(401)
    expect(mockPrisma.storedAsset.findUnique).not.toHaveBeenCalled()
  })

  it('hydrates only asset references bound to the authorized parent record', async () => {
    mockPrisma.storedAsset.findMany.mockResolvedValue([{
      id: 'asset-1',
      accessScope: 'PRIVATE',
      scopeId: null,
    }])
    mockPrisma.assetReference.findMany.mockResolvedValue([{ assetId: 'asset-1' }])

    const hydrated = await hydrateAssetReferences({ images: [{ assetId: 'asset-1' }] }, false, {
      entityType: 'Assignment',
      entityId: 'assignment-1',
      courseId: 'course-1',
      parentAccess: true,
    }) as { images: Array<{ assetId: string; url: string }> }

    expect(hydrated.images[0].url).toContain('/api/assets/asset-1/content')

    mockPrisma.assetReference.findMany.mockResolvedValue([])
    const unbound = await hydrateAssetReferences({ images: [{ assetId: 'asset-1' }] }, false, {
      entityType: 'Assignment',
      entityId: 'assignment-2',
      courseId: 'course-1',
      parentAccess: true,
    }) as { images: Array<{ url: string | null }> }
    expect(unbound.images[0].url).toBeNull()
  })

  it('serves local assets with an explicit MIME type and nosniff protection', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60
    const url = new URL(assetStorageInternals.signedPath('asset-1', expiresAt), 'http://localhost')
    const res = makeRes()

    await serveAsset(request({ query: Object.fromEntries(url.searchParams) }), res)
    await res.finished

    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })
})

it('signs a library page with one projected lookup and no per-asset reads', async () => {
  const { getSignedAssetUrls } = await import('../../services/assetStorage')
  mockPrisma.storedAsset.findMany.mockResolvedValue(Array.from({ length: 40 }, (_, n) => ({ id: `page-${n}`, deletedAt: null, accessScope: 'PRIVATE' })))
  mockPrisma.storedAsset.findMany.mockClear(); mockPrisma.storedAsset.findUnique.mockClear()
  const urls = await getSignedAssetUrls(Array.from({ length: 40 }, (_, n) => `page-${n}`))
  expect(urls.size).toBe(40)
  expect(mockPrisma.storedAsset.findMany).toHaveBeenCalledOnce()
  expect(mockPrisma.storedAsset.findUnique).not.toHaveBeenCalled()
  await expect(getSignedAssetUrls(Array.from({ length: 301 }, (_, n) => `large-${n}`))).rejects.toThrow('page budget')
})
