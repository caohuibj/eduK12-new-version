import { describe, expect, it, vi } from 'vitest'
import { compileCognitiveRuntime } from '../../modules/assessment-runtime/compiler'
import { verifyAssessmentMediaCapability } from '../../modules/assessment-media/assessment-media-capability'
import { listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'
import {
  findFrozenCognitiveVideoPresentation,
  issueFrozenCognitiveVideoCapabilities,
} from '../../modules/cognitive/cognitive-video.service'
import {
  cognitiveImagePresentationAssetReferences,
  cognitivePresentationAssetReferences,
  cognitiveVideoPresentationEntries,
  parseCognitivePresentationDefinition,
} from '../../modules/cognitive/v2/presentation'
import { buildCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { createSessionConfigSnapshot } from '../../modules/cognitive/v2/session-snapshot'

const IMAGE = {
  asset: { assetId: 'cognitive-image', contentHash: '1'.repeat(64), mimeType: 'image/png' as const },
  altText: '说明图片',
}
const VIDEO = { assetId: 'cognitive-video', contentHash: '2'.repeat(64), mimeType: 'video/webm' as const }
const POSTER = { assetId: 'cognitive-poster', contentHash: '3'.repeat(64), mimeType: 'image/webp' as const }
const VTT = { assetId: 'cognitive-vtt', contentHash: '4'.repeat(64), mimeType: 'text/vtt' as const }
const VIDEO_PRESENTATION = {
  schemaVersion: 1 as const,
  video: VIDEO,
  poster: POSTER,
  captions: [{ asset: VTT, kind: 'captions' as const, srcLang: 'zh-CN', label: '中文字幕', default: true }],
  transcript: { language: 'zh-CN', text: '这是非时序关键的认知测评说明视频。' },
  title: '说明视频',
}
const PRESENTATION = parseCognitivePresentationDefinition({
  schemaVersion: 1,
  instruction: [IMAGE],
  videos: {
    instruction: [VIDEO_PRESENTATION],
    example: [{ ...VIDEO_PRESENTATION, title: '示例视频' }],
  },
})

const fakeEntry = () => {
  const entry = listCognitiveRegistryEntries().find((candidate) => candidate.testType === 'fake')
  if (!entry) throw new Error('fake cognitive registry entry missing')
  return entry
}
const fakeConfig = {
  trialCount: 3,
  trialDurationMs: 1000,
  allowPractice: false,
  maxRtMs: 60000,
}
const tokenFrom = (url: string) => new URL(url, 'http://localhost').searchParams.get('cap') || ''

const mediaCatalog = [
  { id: VIDEO.assetId, objectKey: 'assets/video.webm', provider: 'local', mimeType: VIDEO.mimeType, sizeBytes: 100, sha256: VIDEO.contentHash, deletedAt: null },
  { id: POSTER.assetId, objectKey: 'assets/poster.webp', provider: 'local', mimeType: POSTER.mimeType, sizeBytes: 10, sha256: POSTER.contentHash, deletedAt: null },
  { id: VTT.assetId, objectKey: 'assets/caption.vtt', provider: 'local', mimeType: VTT.mimeType, sizeBytes: 20, sha256: VTT.contentHash, deletedAt: null },
]

const mediaDb = (retainedAssetIds = [VIDEO.assetId, POSTER.assetId, VTT.assetId]) => ({
  storedAsset: { findMany: vi.fn().mockResolvedValue(mediaCatalog) },
  assetReference: { findMany: vi.fn().mockResolvedValue(retainedAssetIds.map((assetId) => ({ assetId }))) },
})

describe('MEDIA-7 Cognitive video adapter', () => {
  it('preserves MEDIA-3 image helpers while adding deterministic video slot keys and combined retention refs', () => {
    expect(cognitiveImagePresentationAssetReferences(PRESENTATION).map((asset) => asset.assetId))
      .toEqual([IMAGE.asset.assetId])
    expect(cognitiveVideoPresentationEntries(PRESENTATION).map((entry) => entry.key))
      .toEqual(['instruction:0', 'example:0'])
    expect(cognitivePresentationAssetReferences(PRESENTATION).map((asset) => asset.assetId))
      .toEqual([
        IMAGE.asset.assetId,
        VIDEO.assetId, POSTER.assetId, VTT.assetId,
        VIDEO.assetId, POSTER.assetId, VTT.assetId,
      ])
  })

  it('binds video identity and slot order into runtime identity without changing scoring semantics', () => {
    const plainDefinition = buildCognitiveV2TaskDefinition(fakeEntry(), 'DRAFT')
    const videoDefinition = buildCognitiveV2TaskDefinition({ ...fakeEntry(), presentation: PRESENTATION }, 'DRAFT')
    const reorderedDefinition = buildCognitiveV2TaskDefinition({
      ...fakeEntry(),
      presentation: parseCognitivePresentationDefinition({
        schemaVersion: 1,
        videos: { stimulus: [VIDEO_PRESENTATION] },
      }),
    }, 'DRAFT')

    const plain = compileCognitiveRuntime({ definition: plainDefinition })
    const video = compileCognitiveRuntime({ definition: videoDefinition })
    const reordered = compileCognitiveRuntime({ definition: reorderedDefinition })

    expect(video.sourceDefinitionHash).not.toBe(plain.sourceDefinitionHash)
    expect(video.compiledRuntimeHash).not.toBe(plain.compiledRuntimeHash)
    expect(reordered.sourceDefinitionHash).not.toBe(video.sourceDefinitionHash)
    expect(video.scorerKey).toBe(plain.scorerKey)
    expect(video.scorerVersion).toBe(plain.scorerVersion)
    expect(video.metricDefinitions).toEqual(plain.metricDefinitions)
    expect(video.qualityDefinitions).toEqual(plain.qualityDefinitions)
    expect(video.reportDefinition).toEqual(plain.reportDefinition)
  })

  it('freezes video presentation and issues capabilities only from the exact frozen runtime owner', async () => {
    const definition = buildCognitiveV2TaskDefinition({ ...fakeEntry(), presentation: PRESENTATION }, 'DRAFT')
    const compiledRuntime = compileCognitiveRuntime({ definition })
    const snapshot = createSessionConfigSnapshot({
      definition,
      configVersion: '1.0.0',
      config: fakeConfig,
      runtime: { runtimeGeneration: 'UNIFIED_V1', compiledRuntime, referenceBindings: [] },
      frozenAt: new Date('2026-09-10T00:00:00.000Z'),
    })

    expect(snapshot.presentation).toEqual(PRESENTATION)
    expect(findFrozenCognitiveVideoPresentation(snapshot, 'instruction:0')).toEqual(VIDEO_PRESENTATION)
    expect(findFrozenCognitiveVideoPresentation(snapshot, 'stimulus:0')).toBeUndefined()

    const storage = mediaDb()
    const sources = await issueFrozenCognitiveVideoCapabilities({
      snapshot,
      sessionId: 'session-media-7',
      videoKey: 'instruction:0',
      audience: 'authenticated',
      db: storage as never,
    })
    expect(storage.assetReference.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        entityType: 'AssessmentFrozenRuntime',
        entityId: `COGNITIVE:${compiledRuntime.compiledRuntimeHash}`,
        field: 'media',
      }),
    }))
    const payload = verifyAssessmentMediaCapability(tokenFrom(sources.videoUrl))
    expect(payload).toMatchObject({
      scopeId: 'cognitive-session:session-media-7:instruction:0',
      audience: 'authenticated',
      kind: 'video',
      asset: VIDEO,
    })
  })

  it('fails closed for an unknown slot or when frozen retention is incomplete', async () => {
    const definition = buildCognitiveV2TaskDefinition({ ...fakeEntry(), presentation: PRESENTATION }, 'DRAFT')
    const compiledRuntime = compileCognitiveRuntime({ definition })
    const snapshot = createSessionConfigSnapshot({
      definition,
      configVersion: '1.0.0',
      config: fakeConfig,
      runtime: { runtimeGeneration: 'UNIFIED_V1', compiledRuntime, referenceBindings: [] },
    })

    await expect(issueFrozenCognitiveVideoCapabilities({
      snapshot,
      sessionId: 'session-media-7',
      videoKey: 'stimulus:99',
      audience: 'public',
      db: mediaDb() as never,
    })).rejects.toMatchObject({ statusCode: 404 })

    await expect(issueFrozenCognitiveVideoCapabilities({
      snapshot,
      sessionId: 'session-media-7',
      videoKey: 'instruction:0',
      audience: 'public',
      db: mediaDb([VIDEO.assetId, POSTER.assetId]) as never,
    })).rejects.toMatchObject({ statusCode: 404 })
  })
})
