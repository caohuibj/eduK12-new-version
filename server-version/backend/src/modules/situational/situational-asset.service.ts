import type { Response } from 'express'
import { prisma } from '../../config/database'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import type { AssetDatabase } from '../../services/assetStorage'
import {
  findFrozenAssessmentAssetReference,
  validateAssessmentAssetReferences,
} from '../assessment-media/assessment-asset'
import {
  AssessmentImageDeliveryError,
  assessmentImageInternals,
  serveAssessmentImageContent,
} from '../assessment-media/assessment-image'
import type { FrozenSituationalRuntimeSnapshotV1 } from '../assessment-runtime/situational-runtime-snapshot'
import {
  situationDefinitionAssetReferences,
  type SituationDefinitionV1,
  type SituationalStoredAssetIdentity,
} from './situation-definition'

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

const referencePaths = (definition: SituationDefinitionV1): SituationalStoredAssetIdentity[] => (
  situationDefinitionAssetReferences(definition)
)

/**
 * Situational owns only reference enumeration and its unit-specific error
 * contract. StoredAsset catalog validation is shared by Assessment media.
 */
export const validateSituationalAssetReferences = async (
  definition: SituationDefinitionV1,
  db: AssetDatabase = prisma,
): Promise<SituationalAssetValidation> => {
  const references = referencePaths(definition)
  const validation = await validateAssessmentAssetReferences(references, db)
  return {
    valid: validation.valid,
    references,
    issues: validation.issues.map((issue) => ({
      ...issue,
      path: issue.path.replace(/^references\./u, 'scenes.visualAssetReferences.'),
    })),
  }
}

export const assertSituationalAssetReferencesReady = async (
  definition: SituationDefinitionV1,
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
  findFrozenAssessmentAssetReference(
    situationDefinitionAssetReferences(snapshot.definition),
    assetId,
  ) as SituationalStoredAssetIdentity | undefined
)

/**
 * The attempt route performs Situational authorization before entering this
 * adapter. The requested asset must additionally occur in that attempt's
 * frozen definition; byte delivery and immutable identity revalidation are
 * shared Assessment image responsibilities.
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
  try {
    return await serveAssessmentImageContent({
      reference,
      res: params.res,
      db: params.db || prisma,
    })
  } catch (error) {
    if (error instanceof AssessmentImageDeliveryError) {
      throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '视觉资产已失效或身份不匹配', 404)
    }
    throw error
  }
}

/** Compatibility surface for existing focused tests/debugging only. */
export const situationalAssetInternals = {
  findFrozenAssetReference,
  proxyCosAsset: assessmentImageInternals.proxyCosImage,
}
