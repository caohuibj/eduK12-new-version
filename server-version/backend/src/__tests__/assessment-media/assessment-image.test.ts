import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDb, mockServeStoredAssetContent, mockGetCOSSignedUrl } = vi.hoisted(() => ({
  mockDb: { storedAsset: { findUnique: vi.fn() } },
  mockServeStoredAssetContent: vi.fn(),
  mockGetCOSSignedUrl: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: mockDb }))
vi.mock('../../services/assetStorage', () => ({
  serveStoredAssetContent: mockServeStoredAssetContent,
}))
vi.mock('../../utils/cos', () => ({ getCOSSignedUrl: mockGetCOSSignedUrl }))

import {
  assessmentStaticImageAssetIdentitySchema,
  serveAssessmentImageContent,
} from '../../modules/assessment-media/assessment-image'

const reference = (overrides: Partial<{ assetId: string; contentHash: string; mimeType: string }> = {}) => ({
  assetId: 'asset-image-1',
  contentHash: 'a'.repeat(64),
  mimeType: 'image/png',
  ...overrides,
})

const stored = (overrides: Partial<{
  id: string
  objectKey: string
  provider: string
  mimeType: string
  sizeBytes: number
  sha256: string
  deletedAt: Date | null
}> = {}) => ({
  id: 'asset-image-1',
  objectKey: 'assets/asset-image-1.png',
  provider: 'local',
  mimeType: 'image/png',
  sizeBytes: 10,
  sha256: 'a'.repeat(64),
  deletedAt: null,
  ...overrides,
})

describe('Assessment static image identity', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('accepts %s', (mimeType) => {
    expect(assessmentStaticImageAssetIdentitySchema.safeParse(reference({ mimeType })).success).toBe(true)
  })

  it.each(['image/gif', 'video/mp4'])('rejects unsupported image MIME %s', (mimeType) => {
    expect(assessmentStaticImageAssetIdentitySchema.safeParse(reference({ mimeType })).success).toBe(false)
  })
})

describe('Assessment image delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServeStoredAssetContent.mockResolvedValue(undefined)
    mockGetCOSSignedUrl.mockResolvedValue('https://cos.example.test/signed')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('serves local bytes only after identity revalidation', async () => {
    mockDb.storedAsset.findUnique.mockResolvedValue(stored())
    const response = {} as never
    await serveAssessmentImageContent({ reference: reference() as never, res: response, db: mockDb as never })
    expect(mockServeStoredAssetContent).toHaveBeenCalledWith(expect.objectContaining({ id: 'asset-image-1' }), response)
  })

  it('proxies COS bytes without exposing the signed URL to the caller', async () => {
    mockDb.storedAsset.findUnique.mockResolvedValue(stored({ provider: 'cos' }))
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const response = Object.assign(new PassThrough(), { setHeader: vi.fn() })
    const finished = new Promise<void>((resolve, reject) => {
      response.once('finish', resolve)
      response.once('error', reject)
    })

    await serveAssessmentImageContent({ reference: reference() as never, res: response as never, db: mockDb as never })
    await finished

    expect(mockGetCOSSignedUrl).toHaveBeenCalledWith('assets/asset-image-1.png')
    expect(fetchMock).toHaveBeenCalledWith('https://cos.example.test/signed')
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png')
    expect(mockServeStoredAssetContent).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', null],
    ['deleted', stored({ deletedAt: new Date() })],
    ['invalid provider', stored({ provider: 'external' })],
    ['empty objectKey', stored({ objectKey: '' })],
    ['zero size', stored({ sizeBytes: 0 })],
    ['hash mismatch', stored({ sha256: 'b'.repeat(64) })],
    ['MIME mismatch', stored({ mimeType: 'image/webp' })],
  ])('fails closed for %s delivery state', async (_label, asset) => {
    mockDb.storedAsset.findUnique.mockResolvedValue(asset)
    await expect(serveAssessmentImageContent({
      reference: reference() as never,
      res: {} as never,
      db: mockDb as never,
    })).rejects.toMatchObject({ name: 'AssessmentImageDeliveryError' })
    expect(mockServeStoredAssetContent).not.toHaveBeenCalled()
  })
})
