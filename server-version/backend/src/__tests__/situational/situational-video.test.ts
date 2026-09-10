import { describe, expect, it, vi } from 'vitest'
import { verifyAssessmentMediaCapability } from '../../modules/assessment-media/assessment-media-capability'
import type { FrozenSituationalRuntimeSnapshotV1 } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import {
  situationDefinitionAssetReferences,
  situationalImageAssetReferences,
  situationalStimulusSchema,
} from '../../modules/situational/situation-definition'
import {
  frozenSituationalVideoPresentation,
  issueFrozenSituationalVideoCapabilities,
} from '../../modules/situational/situational-video.service'

const video = { assetId: 'video-s1', contentHash: 'a'.repeat(64), mimeType: 'video/webm' as const }
const poster = { assetId: 'poster-s1', contentHash: 'b'.repeat(64), mimeType: 'image/png' as const }
const caption = { assetId: 'caption-s1', contentHash: 'c'.repeat(64), mimeType: 'text/vtt' as const }
const presentation = {
  schemaVersion: 1 as const,
  video,
  poster,
  captions: [{ asset: caption, kind: 'captions' as const, srcLang: 'zh-CN', label: '中文字幕', default: true }],
  transcript: { language: 'zh-CN', text: '视频文字稿。' },
}

const videoStimulus = {
  type: 'VIDEO' as const,
  text: '请观看视频情境后，根据自己的判断作答。',
  presentation,
}

const scene = {
  sceneKey: 'scene-video',
  title: '视频情境',
  sortOrder: 0,
  stimulus: videoStimulus,
  primaryConstruct: 'judgment',
  secondaryConstructs: [],
  situationFeatures: {},
  channels: [],
}

const snapshot = {
  definition: { scenes: [scene] },
} as unknown as FrozenSituationalRuntimeSnapshotV1

const catalog = [
  { id: video.assetId, objectKey: 'situational/video.webm', provider: 'local', mimeType: video.mimeType, sizeBytes: 100, sha256: video.contentHash, deletedAt: null },
  { id: poster.assetId, objectKey: 'situational/poster.png', provider: 'local', mimeType: poster.mimeType, sizeBytes: 10, sha256: poster.contentHash, deletedAt: null },
  { id: caption.assetId, objectKey: 'situational/caption.vtt', provider: 'local', mimeType: caption.mimeType, sizeBytes: 20, sha256: caption.contentHash, deletedAt: null },
]

const db = (retained = [video.assetId, poster.assetId, caption.assetId]) => ({
  storedAsset: { findMany: vi.fn().mockResolvedValue(catalog) },
  assetReference: { findMany: vi.fn().mockResolvedValue(retained.map((assetId) => ({ assetId }))) },
})

const tokenFrom = (url: string): string => new URL(url, 'http://localhost').searchParams.get('cap') || ''

describe('Situational VIDEO presentation adapter', () => {
  it('accepts the shared MEDIA-4 presentation contract without introducing playback semantics', () => {
    const parsed = situationalStimulusSchema.parse(videoStimulus)
    expect(parsed.type).toBe('VIDEO')
    if (parsed.type !== 'VIDEO') throw new Error('expected VIDEO')
    expect(parsed.presentation).toEqual(presentation)
    expect(parsed).not.toHaveProperty('autoplay')
    expect(parsed).not.toHaveProperty('mustComplete')
    expect(parsed).not.toHaveProperty('transitionOnEnded')
  })

  it('enumerates video, poster and VTT for frozen retention while keeping image delivery refs empty', () => {
    expect(situationalImageAssetReferences(videoStimulus)).toEqual([])
    expect(situationDefinitionAssetReferences({ scenes: [scene] } as never).map((asset) => asset.assetId)).toEqual([
      video.assetId,
      poster.assetId,
      caption.assetId,
    ])
  })

  it('resolves presentation only from the requested frozen VIDEO scene', () => {
    expect(frozenSituationalVideoPresentation(snapshot, scene.sceneKey)).toEqual(presentation)
    expect(() => frozenSituationalVideoPresentation(snapshot, 'missing')).toThrowError(/不属于当前冻结题面/u)

    const textSnapshot = {
      definition: { scenes: [{ ...scene, stimulus: { type: 'TEXT_V1', text: '文字题面' } }] },
    } as unknown as FrozenSituationalRuntimeSnapshotV1
    expect(() => frozenSituationalVideoPresentation(textSnapshot, scene.sceneKey)).toThrowError(/不是视频题面/u)
  })

  it('issues scene-bound public capabilities from the exact frozen retention owner', async () => {
    const storage = db()
    const sources = await issueFrozenSituationalVideoCapabilities({
      snapshot,
      attemptId: 'attempt-video-1',
      sceneKey: scene.sceneKey,
      audience: 'public',
      db: storage as never,
    })

    expect(storage.assetReference.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        entityType: 'AssessmentFrozenRuntime',
        entityId: 'SITUATIONAL:attempt-video-1',
        field: 'media',
        assetId: { in: [video.assetId, poster.assetId, caption.assetId] },
      }),
    }))

    const payload = verifyAssessmentMediaCapability(tokenFrom(sources.videoUrl))
    expect(payload).toMatchObject({
      audience: 'public',
      kind: 'video',
      asset: video,
    })
    expect(payload.scopeId).toMatch(/^SITUATIONAL:attempt-video-1:[a-f0-9]{64}$/u)
  })

  it('fails closed when any VIDEO presentation asset is outside frozen retention', async () => {
    await expect(issueFrozenSituationalVideoCapabilities({
      snapshot,
      attemptId: 'attempt-video-1',
      sceneKey: scene.sceneKey,
      audience: 'authenticated',
      db: db([video.assetId, poster.assetId]) as never,
    })).rejects.toMatchObject({
      code: 'INSTRUMENT_NOT_AVAILABLE',
      statusCode: 409,
    })
  })
})
