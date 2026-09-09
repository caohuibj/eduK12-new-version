import type { Response } from 'express'
import { prisma } from '../../config/database'
import {
  ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
  ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
  assertAssessmentAssetReferencesReady,
  findFrozenAssessmentAssetReference,
  retainAssessmentAssetReferences,
  type AssessmentAssetRetentionOwner,
} from '../assessment-media/assessment-asset'
import { assessmentImageAssetReferences } from '../assessment-media/assessment-image-presentation'
import { serveAssessmentImageContent } from '../assessment-media/assessment-image-delivery'
import type { FrozenScaleRuntimeSnapshotV1 } from '../assessment-runtime/runtime-snapshot'
import type { ScaleDefinitionV2 } from './scale-definition'
import type { AssetDatabase } from '../../services/assetStorage'

export const ASSESSMENT_PUBLISHED_DEFINITION_REFERENCE_TYPE = 'AssessmentPublishedDefinition'
export const ASSESSMENT_PUBLISHED_MEDIA_FIELD = 'media'

export const scaleAssessmentImageReferences = (definition: ScaleDefinitionV2) => (
  definition.items.flatMap((item) => assessmentImageAssetReferences(item.images))
)

export const assertScaleAssessmentImagesReady = async (
  definition: ScaleDefinitionV2,
  db: AssetDatabase = prisma,
): Promise<void> => assertAssessmentAssetReferencesReady(scaleAssessmentImageReferences(definition), db)

export const publishedScaleMediaOwner = (scaleId: string, definitionHash: string): AssessmentAssetRetentionOwner => ({
  entityType: ASSESSMENT_PUBLISHED_DEFINITION_REFERENCE_TYPE,
  entityId: `SCALE:${scaleId}:${definitionHash}`,
  field: ASSESSMENT_PUBLISHED_MEDIA_FIELD,
})

export const frozenScaleMediaOwner = (assessmentId: string): AssessmentAssetRetentionOwner => ({
  entityType: ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
  entityId: `SCALE:${assessmentId}`,
  field: ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
})

export const retainScaleAssessmentImages = async (input: {
  owner: AssessmentAssetRetentionOwner
  definition: ScaleDefinitionV2
  db?: AssetDatabase
}): Promise<void> => retainAssessmentAssetReferences({
  owner: input.owner,
  references: scaleAssessmentImageReferences(input.definition),
  db: input.db,
})

export const serveFrozenScaleAssessmentImage = async (input: {
  snapshot: FrozenScaleRuntimeSnapshotV1
  assetId: string
  res: Response
  db?: AssetDatabase
}): Promise<void> => {
  const reference = findFrozenAssessmentAssetReference(
    scaleAssessmentImageReferences(input.snapshot.definition),
    input.assetId,
  )
  if (!reference) throw new Error('Assessment image is not referenced by the frozen Scale runtime')
  await serveAssessmentImageContent({ reference, res: input.res, db: input.db })
}
