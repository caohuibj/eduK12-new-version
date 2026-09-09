import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import { freezeSituationalRuntimeAtAttemptStart } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import type { SituationDefinitionV1 } from '../../modules/situational/situation-definition'

const { mockPrisma, mockServeStoredAssetContent, mockAttachAssetReference, mockGetCOSSignedUrl } = vi.hoisted(() => ({
  mockPrisma: {
    storedAsset: { findMany: vi.fn(), findUnique: vi.fn() },
    assetReference: { upsert: vi.fn() },
  },
  mockServeStoredAssetContent: vi.fn(),
  mockAttachAssetReference: vi.fn(),
  mockGetCOSSignedUrl: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../services/assetStorage', () => ({
  serveStoredAssetContent: mockServeStoredAssetContent,
  attachAssetReference: mockAttachAssetReference,
}))
vi.mock('../../utils/cos', () => ({
  getCOSSignedUrl: mockGetCOSSignedUrl,
}))

import {
  assertSituationalAssetReferencesReady,
  serveFrozenSituationalAsset,
  validateSituationalAssetReferences,
} from '../../modules/situational/situational-asset.service'

const visualDefinition = (): SituationDefinitionV1 => {
  const definition = JSON.parse(JSON.stringify(SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION)) as SituationDefinitionV1
  definition.scenes[0]!.stimulus = {
    type: 'IMAGE',
    text: definition.scenes[0]!.stimulus.text,
    asset: { assetId: 'asset-image-1', contentHash: 'a'.repeat(64), mimeType: 'image/png' },
    altText: '第一张测试图片',
  }
  definition.scenes[1]!.stimulus = {
    type: 'COMIC',
    text: definition.scenes[1]!.stimulus.text,
    panels: [{
      assetRef: { assetId: 'asset-panel-1', contentHash: 'b'.repeat(64), mimeType: 'image/webp' },
      altText: '第一格测试漫画',
    }],
  }
  return definition
}

const asset = (id: string, sha256: string, mimeType: string, provider = 'local') => ({
  id,
  objectKey: `assets/${id}.png`,
  provider,
  mimeType,
  sizeBytes: 10,
  sha256,
  deletedAt: null,
})

describe('situational static asset adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServeStoredAssetContent.mockResolvedValue(undefined)
    mockGetCOSSignedUrl.mockResolvedValue('https://cos.example.test/signed')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('projects every Situational reference into shared catalog validation', async () => {
    mockPrisma.storedAsset.findMany.mockResolvedValue([
      asset('asset-image-1', 'a'.repeat(64), 'image/png'),
      asset('asset-panel-1', 'wrong'.padEnd(64, '0'), 'image/png'),
    ])

    const validation = await validateSituationalAssetReferences(visualDefinition(), mockPrisma as never)
    expect(validation.valid).toBe(false)
    expect(validation.references.map((reference) => reference.assetId)).toEqual(['asset-image-1', 'asset-panel-1'])
    expect(validation.issues.map((issue) => issue.message).join('\n')).toContain('MIME')
    expect(validation.issues.map((issue) => issue.message).join('\n')).toContain('contentHash')
    await expect(assertSituationalAssetReferencesReady(visualDefinition(), mockPrisma as never)).rejects.toMatchObject({
      code: 'INSTRUMENT_NOT_AVAILABLE',
    })
  })

  it('accepts a complete immutable asset catalog through the compatibility wrapper', async () => {
    mockPrisma.storedAsset.findMany.mockResolvedValue([
      asset('asset-image-1', 'a'.repeat(64), 'image/png'),
      asset('asset-panel-1', 'b'.repeat(64), 'image/webp'),
    ])
    await expect(assertSituationalAssetReferencesReady(visualDefinition(), mockPrisma as never)).resolves.toBeUndefined()
    expect(mockPrisma.storedAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['asset-image-1', 'asset-panel-1'] } },
    }))
  })

  it('serves only an asset referenced by the authorized frozen definition', async () => {
    const definition = visualDefinition()
    const snapshot = freezeSituationalRuntimeAtAttemptStart({
      instrumentKey: 'visual-fixture',
      instrumentVersion: '1.0.0',
      definition,
      frozenAt: new Date('2026-09-09T00:00:00.000Z'),
    })
    mockPrisma.storedAsset.findUnique.mockResolvedValue(asset('asset-image-1', 'a'.repeat(64), 'image/png'))
    const response = {} as never

    await serveFrozenSituationalAsset({ snapshot, assetId: 'asset-image-1', res: response, db: mockPrisma as never })
    expect(mockServeStoredAssetContent).toHaveBeenCalledWith(expect.objectContaining({
      id: 'asset-image-1',
      sha256: 'a'.repeat(64),
    }), response)

    await expect(serveFrozenSituationalAsset({ snapshot, assetId: 'asset-not-referenced', res: response, db: mockPrisma as never }))
      .rejects.toMatchObject({ code: 'INSTRUMENT_NOT_AVAILABLE', statusCode: 404 })
  })

  it('proxies COS bytes through the shared application delivery core', async () => {
    const snapshot = freezeSituationalRuntimeAtAttemptStart({
      instrumentKey: 'visual-fixture',
      instrumentVersion: '1.0.0',
      definition: visualDefinition(),
      frozenAt: new Date('2026-09-09T00:00:00.000Z'),
    })
    mockPrisma.storedAsset.findUnique.mockResolvedValue(asset('asset-image-1', 'a'.repeat(64), 'image/png', 'cos'))
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const response = Object.assign(new PassThrough(), { setHeader: vi.fn() })
    const finished = new Promise<void>((resolve, reject) => {
      response.once('finish', resolve)
      response.once('error', reject)
    })

    await serveFrozenSituationalAsset({ snapshot, assetId: 'asset-image-1', res: response as never, db: mockPrisma as never })
    await finished

    expect(mockGetCOSSignedUrl).toHaveBeenCalledWith('assets/asset-image-1.png')
    expect(fetchMock).toHaveBeenCalledWith('https://cos.example.test/signed')
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png')
    expect(mockServeStoredAssetContent).not.toHaveBeenCalled()
  })

  it('maps shared delivery identity drift back to the existing Situational error contract', async () => {
    const snapshot = freezeSituationalRuntimeAtAttemptStart({
      instrumentKey: 'visual-fixture',
      instrumentVersion: '1.0.0',
      definition: visualDefinition(),
      frozenAt: new Date('2026-09-09T00:00:00.000Z'),
    })
    mockPrisma.storedAsset.findUnique.mockResolvedValue(asset('asset-image-1', 'c'.repeat(64), 'image/png'))

    await expect(serveFrozenSituationalAsset({ snapshot, assetId: 'asset-image-1', res: {} as never, db: mockPrisma as never }))
      .rejects.toMatchObject({ code: 'INSTRUMENT_NOT_AVAILABLE', statusCode: 404 })
    expect(mockServeStoredAssetContent).not.toHaveBeenCalled()
  })
})
