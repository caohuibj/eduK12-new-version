import { describe, expect, it, vi } from 'vitest'
import {
  issueFrozenAssessmentVideoCapabilities,
  verifyAssessmentMediaCapability,
} from '../../modules/assessment-media/assessment-media-capability'

const video = { assetId: 'video-1', contentHash: 'a'.repeat(64), mimeType: 'video/mp4' as const }
const poster = { assetId: 'poster-1', contentHash: 'b'.repeat(64), mimeType: 'image/png' as const }
const caption = { assetId: 'caption-1', contentHash: 'c'.repeat(64), mimeType: 'text/vtt' as const }
const presentation = {
  schemaVersion: 1 as const,
  video,
  poster,
  captions: [{ asset: caption, kind: 'captions' as const, srcLang: 'en', label: 'English', default: true }],
}

const catalog = [
  { id: video.assetId, objectKey: 'assets/video.mp4', provider: 'local', mimeType: video.mimeType, sizeBytes: 100, sha256: video.contentHash, deletedAt: null },
  { id: poster.assetId, objectKey: 'assets/poster.png', provider: 'local', mimeType: poster.mimeType, sizeBytes: 10, sha256: poster.contentHash, deletedAt: null },
  { id: caption.assetId, objectKey: 'assets/caption.vtt', provider: 'local', mimeType: caption.mimeType, sizeBytes: 20, sha256: caption.contentHash, deletedAt: null },
]

const owner = { entityType: 'AssessmentFrozenRuntime', entityId: 'SITUATIONAL:attempt-1', field: 'media' }

const db = (retainedAssetIds = [video.assetId, poster.assetId, caption.assetId]) => ({
  storedAsset: {
    findMany: vi.fn().mockResolvedValue(catalog),
  },
  assetReference: {
    findMany: vi.fn().mockResolvedValue(retainedAssetIds.map((assetId) => ({ assetId }))),
  },
})

const tokenFrom = (url: string) => new URL(url, 'http://localhost').searchParams.get('cap') || ''

describe('frozen Assessment video capability issuance', () => {
  it('issues native-media URLs only after exact catalog and frozen-retention validation', async () => {
    const storage = db()
    const sources = await issueFrozenAssessmentVideoCapabilities({
      scopeId: 'attempt:1',
      audience: 'public',
      presentation,
      retentionOwner: owner,
      db: storage as never,
      ttlSeconds: 60,
      nowSeconds: 100,
    })

    expect(storage.storedAsset.findMany).toHaveBeenCalledTimes(1)
    expect(storage.assetReference.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        entityType: owner.entityType,
        entityId: owner.entityId,
        field: owner.field,
        assetId: { in: [video.assetId, poster.assetId, caption.assetId] },
      }),
    }))

    const videoPayload = verifyAssessmentMediaCapability(tokenFrom(sources.videoUrl), 120)
    const posterPayload = verifyAssessmentMediaCapability(tokenFrom(sources.posterUrl!), 120)
    const captionPayload = verifyAssessmentMediaCapability(tokenFrom(sources.captions[0]!.src), 120)
    expect(videoPayload).toMatchObject({ scopeId: 'attempt:1', audience: 'public', kind: 'video', asset: video })
    expect(posterPayload).toMatchObject({ scopeId: 'attempt:1', audience: 'public', kind: 'poster', asset: poster })
    expect(captionPayload).toMatchObject({ scopeId: 'attempt:1', audience: 'public', kind: 'caption', asset: caption })
    expect(sources.expiresAt).toBe(160)
  })

  it('fails closed when any declared media asset is not retained by the frozen owner', async () => {
    await expect(issueFrozenAssessmentVideoCapabilities({
      scopeId: 'attempt:1',
      audience: 'authenticated',
      presentation,
      retentionOwner: owner,
      db: db([video.assetId, poster.assetId]) as never,
    })).rejects.toMatchObject({ reason: 'NOT_FROZEN' })
  })

  it('fails before signing when the StoredAsset catalog identity drifted', async () => {
    const storage = db()
    storage.storedAsset.findMany.mockResolvedValue([
      { ...catalog[0], sha256: 'd'.repeat(64) },
      catalog[1],
      catalog[2],
    ])
    await expect(issueFrozenAssessmentVideoCapabilities({
      scopeId: 'attempt:1',
      audience: 'authenticated',
      presentation,
      retentionOwner: owner,
      db: storage as never,
    })).rejects.toMatchObject({ name: 'AssessmentAssetValidationError' })
    expect(storage.assetReference.findMany).not.toHaveBeenCalled()
  })
})
