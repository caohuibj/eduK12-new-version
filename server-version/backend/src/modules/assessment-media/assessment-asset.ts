import { prisma } from '../../config/database'
import {
  attachAssetReference,
  type AssetDatabase,
  type StoredAssetContent,
} from '../../services/assetStorage'
import {
  assessmentAssetIdSchema,
  assessmentAssetIdentitySchema,
  type AssessmentAssetIdentityV1,
} from './assessment-asset-identity'

export {
  assessmentAssetIdSchema,
  assessmentAssetIdentitySchema,
}
export type { AssessmentAssetIdentityV1 }

export interface AssessmentAssetIssue {
  path: string
  message: string
  severity: 'error'
}

export interface AssessmentAssetValidation {
  valid: boolean
  issues: AssessmentAssetIssue[]
  references: AssessmentAssetIdentityV1[]
}

export class AssessmentAssetValidationError extends Error {
  readonly issues: AssessmentAssetIssue[]

  constructor(message: string, issues: AssessmentAssetIssue[]) {
    super(message)
    this.name = 'AssessmentAssetValidationError'
    this.issues = issues
  }
}

type StoredAssetRecord = Pick<StoredAssetContent, 'id' | 'objectKey' | 'provider' | 'mimeType' | 'sizeBytes' | 'sha256' | 'deletedAt'>

export const assessmentAssetSelect = {
  id: true,
  objectKey: true,
  provider: true,
  mimeType: true,
  sizeBytes: true,
  sha256: true,
  deletedAt: true,
} as const

const invalidCatalogRecord = (asset: StoredAssetRecord | undefined): boolean => (
  !asset
  || Boolean(asset.deletedAt)
  || asset.sizeBytes <= 0
  || !asset.objectKey
  || !['local', 'cos'].includes(asset.provider)
)

export const validateAssessmentAssetReferences = async (
  references: readonly AssessmentAssetIdentityV1[],
  db: AssetDatabase = prisma,
): Promise<AssessmentAssetValidation> => {
  const normalizedReferences = [...references]
  const assetIds = [...new Set(normalizedReferences.map((reference) => reference.assetId))]
  if (!assetIds.length) return { valid: true, issues: [], references: normalizedReferences }

  const assets = await db.storedAsset.findMany({
    where: { id: { in: assetIds } },
    select: assessmentAssetSelect,
  })
  const byId = new Map<string, StoredAssetRecord>(assets.map((asset) => [asset.id, asset]))
  const issues: AssessmentAssetIssue[] = []

  normalizedReferences.forEach((reference, index) => {
    const asset = byId.get(reference.assetId)
    const path = `references.${index}`
    if (invalidCatalogRecord(asset)) {
      issues.push({ path, message: `Assessment asset is missing or unreadable: ${reference.assetId}`, severity: 'error' })
      return
    }
    if (asset!.mimeType !== reference.mimeType) {
      issues.push({ path: `${path}.mimeType`, message: `Assessment asset MIME does not match StoredAsset: ${reference.assetId}`, severity: 'error' })
    }
    if (asset!.sha256 !== reference.contentHash) {
      issues.push({ path: `${path}.contentHash`, message: `Assessment asset contentHash does not match StoredAsset: ${reference.assetId}`, severity: 'error' })
    }
  })

  return { valid: issues.length === 0, issues, references: normalizedReferences }
}

export const assertAssessmentAssetReferencesReady = async (
  references: readonly AssessmentAssetIdentityV1[],
  db: AssetDatabase = prisma,
): Promise<void> => {
  const validation = await validateAssessmentAssetReferences(references, db)
  if (!validation.valid) {
    throw new AssessmentAssetValidationError('Assessment asset references failed catalog validation', validation.issues)
  }
}

export const findFrozenAssessmentAssetReference = (
  references: readonly AssessmentAssetIdentityV1[],
  assetId: string,
): AssessmentAssetIdentityV1 | undefined => references.find((reference) => reference.assetId === assetId)

export interface AssessmentAssetRetentionOwner {
  entityType: string
  entityId: string
  field: string
}

export const ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE = 'AssessmentFrozenRuntime'
export const ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD = 'media'

export const retainAssessmentAssetReferences = async (params: {
  owner: AssessmentAssetRetentionOwner
  references: readonly AssessmentAssetIdentityV1[]
  db?: AssetDatabase
}): Promise<void> => {
  const db = params.db || prisma
  await assertAssessmentAssetReferencesReady(params.references, db)

  const uniqueReferences = params.references.filter((reference, index, all) => (
    all.findIndex((candidate) => candidate.assetId === reference.assetId) === index
  ))

  for (const reference of uniqueReferences) {
    await attachAssetReference({
      assetId: reference.assetId,
      entityType: params.owner.entityType,
      entityId: params.owner.entityId,
      field: params.owner.field,
    }, db)
  }
}
