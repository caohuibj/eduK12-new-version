import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDb, mockAttachAssetReference } = vi.hoisted(() => ({
  mockDb: {
    storedAsset: { findMany: vi.fn() },
    assetReference: { upsert: vi.fn() },
  },
  mockAttachAssetReference: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: mockDb }))
vi.mock('../../services/assetStorage', () => ({
  attachAssetReference: mockAttachAssetReference,
}))

import {
  ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
  ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
  assessmentAssetIdentitySchema,
  findFrozenAssessmentAssetReference,
  retainAssessmentAssetReferences,
  validateAssessmentAssetReferences,
} from '../../modules/assessment-media/assessment-asset'

const identity = (overrides: Partial<{ assetId: string; contentHash: string; mimeType: string }> = {}) => ({
  assetId: 'asset-1',
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
  id: 'asset-1',
  objectKey: 'assets/asset-1.png',
  provider: 'local',
  mimeType: 'image/png',
  sizeBytes: 10,
  sha256: 'a'.repeat(64),
  deletedAt: null,
  ...overrides,
})

describe('Assessment asset identity', () => {
  it('accepts stable internal identities including future video MIME values', () => {
    expect(assessmentAssetIdentitySchema.parse(identity())).toEqual(identity())
    expect(assessmentAssetIdentitySchema.parse(identity({ mimeType: 'video/mp4' })).mimeType).toBe('video/mp4')
  })

  it.each([
    'http://example.test/image.png',
    'https://example.test/image.png',
    'data:image/png;base64,AAAA',
    'assets/image.png',
  ])('rejects non-internal asset identity %s', (assetId) => {
    expect(assessmentAssetIdentitySchema.safeParse(identity({ assetId })).success).toBe(false)
  })

  it('rejects malformed or uppercase content hashes', () => {
    expect(assessmentAssetIdentitySchema.safeParse(identity({ contentHash: 'bad' })).success).toBe(false)
    expect(assessmentAssetIdentitySchema.safeParse(identity({ contentHash: 'A'.repeat(64) })).success).toBe(false)
  })
})

describe('Assessment asset catalog and retention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAttachAssetReference.mockResolvedValue({})
  })

  it('accepts a complete immutable catalog record', async () => {
    mockDb.storedAsset.findMany.mockResolvedValue([stored()])
    await expect(validateAssessmentAssetReferences([identity()], mockDb as never)).resolves.toMatchObject({ valid: true, issues: [] })
  })

  it.each([
    ['missing', []],
    ['deleted', [stored({ deletedAt: new Date() })]],
    ['empty objectKey', [stored({ objectKey: '' })]],
    ['invalid provider', [stored({ provider: 'external' })]],
    ['zero size', [stored({ sizeBytes: 0 })]],
    ['hash mismatch', [stored({ sha256: 'b'.repeat(64) })]],
    ['MIME mismatch', [stored({ mimeType: 'image/webp' })]],
  ])('fails closed for %s StoredAsset state', async (_label, assets) => {
    mockDb.storedAsset.findMany.mockResolvedValue(assets)
    const result = await validateAssessmentAssetReferences([identity()], mockDb as never)
    expect(result.valid).toBe(false)
    expect(result.issues).not.toHaveLength(0)
  })

  it('looks up only a frozen referenced asset identity', () => {
    expect(findFrozenAssessmentAssetReference([identity()], 'asset-1')).toEqual(identity())
    expect(findFrozenAssessmentAssetReference([identity()], 'asset-2')).toBeUndefined()
  })

  it('retains unique frozen references idempotently through the supplied database client', async () => {
    mockDb.storedAsset.findMany.mockResolvedValue([stored()])
    const owner = {
      entityType: ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
      entityId: 'SITUATIONAL:attempt-1',
      field: ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
    }
    await retainAssessmentAssetReferences({
      owner,
      references: [identity(), identity()],
      db: mockDb as never,
    })

    expect(mockAttachAssetReference).toHaveBeenCalledTimes(1)
    expect(mockAttachAssetReference).toHaveBeenCalledWith({
      assetId: 'asset-1',
      ...owner,
    }, mockDb)
  })

  it('does nothing for a text-only frozen definition with no asset references', async () => {
    await retainAssessmentAssetReferences({
      owner: {
        entityType: ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
        entityId: 'SITUATIONAL:text-attempt',
        field: ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
      },
      references: [],
      db: mockDb as never,
    })
    expect(mockDb.storedAsset.findMany).not.toHaveBeenCalled()
    expect(mockAttachAssetReference).not.toHaveBeenCalled()
  })

  it('does not retain an identity that fails catalog validation', async () => {
    mockDb.storedAsset.findMany.mockResolvedValue([stored({ sha256: 'b'.repeat(64) })])
    await expect(retainAssessmentAssetReferences({
      owner: {
        entityType: ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
        entityId: 'SITUATIONAL:attempt-1',
        field: ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
      },
      references: [identity()],
      db: mockDb as never,
    })).rejects.toMatchObject({ name: 'AssessmentAssetValidationError' })
    expect(mockAttachAssetReference).not.toHaveBeenCalled()
  })
})
