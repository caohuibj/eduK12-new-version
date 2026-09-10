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
} from '../assessment-media/assessment-image-delivery'
import type { FrozenSituationalRuntimeSnapshotV1 } from '../assessment-runtime/situational-runtime-snapshot'
import {
  situationalAssetReferences,
  situationalImageAssetReferences,
  type SituationalAssetReference,
  type SituationalSceneDefinition,
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
  references: SituationalAssetReference[]
}

type SituationAssetReferenceSource = {
  scenes: ReadonlyArray<Pick<SituationalSceneDefinition, 'stimulus'>>
}

const referencePaths = (definition: SituationAssetReferenceSource): SituationalAssetReference[] => (
  definition.scenes.flatMap((scene) => situationalAssetReferences(scene.stimulus))
)

const imageReferencePaths = (definition: SituationAssetReferenceSource): SituationalStoredAssetIdentity[] => (
  definition.scenes.flatMap((scene) => situationalImageAssetReferences(scene.stimulus))
)

/**
 * Situational owns only reference enumeration and its unit-specific error
 * contract. StoredAsset catalog validation is shared by Assessment media.
 */
export const validateSituationalAssetReferences = async (
  definition: SituationAssetReferenceSource,
  db: AssetDatabase = prisma,
): Promise<SituationalAssetValidation> => {
  const references = referencePaths(definition)
  const validation = await validateAssessmentAssetReferences(references, db)
  return {
    valid: validation.valid,
    references,
    issues: validation.issues.map((issue) => ({
      ...issue,
      path: issue.path.replace(/^references\./u, 'scenes.mediaAssetReferences.'),
    })),
  }
}

export const assertSituationalAssetReferencesReady = async (
  definition: SituationAssetReferenceSource,
  db: AssetDatabase = prisma,
): Promise<void> => {
  const validation = await validateSituationalAssetReferences(definition, db)
  if (!validation.valid) {
    throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '情境化媒体内容未通过资产校验', 409)
  }
}

const findFrozenAssetReference = (
  snapshot: FrozenSituationalRuntimeSnapshotV1,
  assetId: string,
): SituationalStoredAssetIdentity | undefined => (
  findFrozenAssessmentAssetReference(
    imageReferencePaths(snapshot.definition),
    assetId,
  ) as SituationalStoredAssetIdentity | undefined
)

/**
 * The attempt route performs Situational authorization before entering this
 * adapter. This legacy endpoint remains IMAGE/COMIC-only; VIDEO, poster and
 * caption bytes use MEDIA-4 capability delivery instead.
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
