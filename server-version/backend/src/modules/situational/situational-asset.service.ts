import { Readable } from 'node:stream'
import type { Response } from 'express'
import { prisma } from '../../config/database'
import {
  situationalAssetReferences,
  type SituationalSceneDefinition,
  type SituationalStoredAssetIdentity,
} from './situation-definition'
import type { FrozenSituationalRuntimeSnapshotV1 } from '../assessment-runtime/situational-runtime-snapshot'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import {
  serveStoredAssetContent,
  type AssetDatabase,
  type StoredAssetContent,
} from '../../services/assetStorage'
import { getCOSSignedUrl } from '../../utils/cos'

export interface SituationalAssetIssue {
  path: string
  message: string
  severity: 'error'
}

export interface SituationalAssetValidation {
  valid: boolean
  issues: SituationalAssetIssue[]
  references: SituationalStoredAssetIdentity[]
}

type StoredAssetRecord = Pick<StoredAssetContent, 'id' | 'objectKey' | 'provider' | 'mimeType' | 'sizeBytes' | 'sha256' | 'deletedAt'>
type SituationAssetReferenceSource = {
  scenes: ReadonlyArray<Pick<SituationalSceneDefinition, 'stimulus'>>
}

const assetSelect = {
  id: true,
  objectKey: true,
  provider: true,
  mimeType: true,
  sizeBytes: true,
  sha256: true,
  deletedAt: true,
} as const

const referencePaths = (definition: SituationAssetReferenceSource): SituationalStoredAssetIdentity[] => (
  definition.scenes.flatMap((scene) => situationalAssetReferences(scene.stimulus))
)

/**
 * Verify the stable asset identity recorded in a definition against the
 * existing StoredAsset catalog.  This is intentionally separate from the
 * pure definition validator: publication/runtime admission is the point at
 * which the database-backed asset must exist and still match its hash.
 */
export const validateSituationalAssetReferences = async (
  definition: SituationAssetReferenceSource,
  db: AssetDatabase = prisma,
): Promise<SituationalAssetValidation> => {
  const references = referencePaths(definition)
  const assetIds = [...new Set(references.map((reference) => reference.assetId))]
  if (!assetIds.length) return { valid: true, issues: [], references }

  const assets = await db.storedAsset.findMany({
    where: { id: { in: assetIds } },
    select: assetSelect,
  })
  const byId = new Map<string, StoredAssetRecord>(assets.map((asset) => [asset.id, asset]))
  const issues: SituationalAssetIssue[] = []

  references.forEach((reference, index) => {
    const asset = byId.get(reference.assetId)
    const path = `scenes.visualAssetReferences.${index}`
    if (!asset || asset.deletedAt || asset.sizeBytes <= 0 || !asset.objectKey || !['local', 'cos'].includes(asset.provider)) {
      issues.push({ path, message: `视觉资产不存在或不可读取：${reference.assetId}`, severity: 'error' })
      return
    }
    if (asset.mimeType !== reference.mimeType) {
      issues.push({ path: `${path}.mimeType`, message: `视觉资产 MIME 与 StoredAsset 不一致：${reference.assetId}`, severity: 'error' })
    }
    if (asset.sha256 !== reference.contentHash) {
      issues.push({ path: `${path}.contentHash`, message: `视觉资产 contentHash 与 StoredAsset 不一致：${reference.assetId}`, severity: 'error' })
    }
  })

  return { valid: issues.length === 0, issues, references }
}

export const assertSituationalAssetReferencesReady = async (
  definition: SituationAssetReferenceSource,
  db: AssetDatabase = prisma,
): Promise<void> => {
  const validation = await validateSituationalAssetReferences(definition, db)
  if (!validation.valid) {
    throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '情境化视觉内容未通过资产校验', 409)
  }
}

const findFrozenAssetReference = (
  snapshot: FrozenSituationalRuntimeSnapshotV1,
  assetId: string,
): SituationalStoredAssetIdentity | undefined => (
  referencePaths(snapshot.definition).find((reference) => reference.assetId === assetId)
)

const proxyCosAsset = async (asset: StoredAssetRecord, res: Response): Promise<Response | void> => {
  let upstream: globalThis.Response
  try {
    const signedUrl = await getCOSSignedUrl(asset.objectKey)
    upstream = await fetch(signedUrl)
  } catch {
    throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '视觉资产暂时无法读取', 404)
  }
  if (!upstream.ok || !upstream.body) {
    throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '视觉资产暂时无法读取', 404)
  }

  // Public recovery uses an authorization header that an <img> redirect cannot
  // preserve. Proxy only the Situational COS bytes through the already-
  // authorized application route so the browser never depends on bucket CORS
  // and never receives the signed COS URL.
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Type', asset.mimeType)
  res.setHeader('Content-Length', String(asset.sizeBytes))
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(asset.id)}"`)
  const stream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0])
  stream.on('error', () => res.destroy())
  return stream.pipe(res)
}

/**
 * A delivery request is authorized by the already-authorized attempt and can
 * only address an asset referenced by that attempt's frozen definition.  The
 * content hash and MIME are checked again at delivery so catalog drift fails
 * closed instead of silently changing the stimulus.
 */
export const serveFrozenSituationalAsset = async (params: {
  snapshot: FrozenSituationalRuntimeSnapshotV1
  assetId: string
  res: Response
  db?: AssetDatabase
}): Promise<Response | void> => {
  const reference = findFrozenAssetReference(params.snapshot, params.assetId)
  if (!reference) {
    throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '视觉资产不属于当前冻结题面', 404)
  }
  const db = params.db || prisma
  const asset = await db.storedAsset.findUnique({
    where: { id: params.assetId },
    select: assetSelect,
  })
  if (
    !asset
    || asset.deletedAt
    || asset.sizeBytes <= 0
    || !asset.objectKey
    || !['local', 'cos'].includes(asset.provider)
    || asset.sha256 !== reference.contentHash
    || asset.mimeType !== reference.mimeType
  ) {
    throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '视觉资产已失效或身份不匹配', 404)
  }
  if (asset.provider === 'cos') return proxyCosAsset(asset, params.res)
  return serveStoredAssetContent(asset, params.res)
}

export const situationalAssetInternals = { findFrozenAssetReference, proxyCosAsset }
