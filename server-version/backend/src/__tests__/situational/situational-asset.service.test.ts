import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_DEFINITION } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import { freezeSituationalRuntimeAtAttemptStart } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import type { SituationDefinitionV1 } from '../../modules/situational/situation-definition'

const { mockPrisma, mockServeStoredAssetContent } = vi.hoisted(() => ({
  mockPrisma: { storedAsset: { findMany: vi.fn(), findUnique: vi.fn() } },
  mockServeStoredAssetContent: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: mockPrisma }))
vi.mock('../../services/assetStorage', () => ({
  serveStoredAssetContent: mockServeStoredAssetContent,
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
    asset: { assetId: 'asset-image-1', contentHash: 'a'.repeat(64), mimeType: 'image/png' },
    altText: '第一张测试图片',
  }
  definition.scenes[1]!.stimulus = {
    type: 'COMIC',
    panels: [{
      assetRef: { assetId: 'asset-panel-1', contentHash: 'b'.repeat(64), mimeType: 'image/webp' },
      altText: '第一格测试漫画',
    }],
  }
  return definition
}

const asset = (id: string, sha256: string, mimeType: string) => ({
  id,
  objectKey: `assets/${id}.png`,
  provider: 'local',
  mimeType,
  sizeBytes: 10,
  sha256,
  deletedAt: null,
})

describe('situational static asset boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockServeStoredAssetContent.mockResolvedValue(undefined)
  })

  it('requires every referenced StoredAsset to exist and match MIME/hash identity', async () => {
    mockPrisma.storedAsset.findMany.mockResolvedValue([
      asset('asset-image-1', 'a'.repeat(64), 'image/png'),
      asset('asset-panel-1', 'wrong'.padEnd(64, '0'), 'image/png'),
    ])

    const validation = await validateSituationalAssetReferences(visualDefinition(), mockPrisma as never)
    expect(validation.valid).toBe(false)
    expect(validation.issues.map((issue) => issue.message).join('\n')).toContain('MIME')
    expect(validation.issues.map((issue) => issue.message).join('\n')).toContain('contentHash')
    await expect(assertSituationalAssetReferencesReady(visualDefinition(), mockPrisma as never)).rejects.toMatchObject({
      code: 'INSTRUMENT_NOT_AVAILABLE',
    })
  })

  it('accepts a complete immutable asset catalog', async () => {
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

  it('fails closed when the StoredAsset hash drifts after the attempt was frozen', async () => {
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

