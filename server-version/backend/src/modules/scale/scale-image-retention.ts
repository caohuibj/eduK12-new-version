import { prisma } from '../../config/database'
import type { AssetDatabase } from '../../services/assetStorage'
import {
  ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
  ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
  ASSESSMENT_PUBLISHED_DEFINITION_REFERENCE_TYPE,
  ASSESSMENT_PUBLISHED_MEDIA_FIELD,
  assertAssessmentAssetReferencesReady,
  retainAssessmentAssetReferences,
  type AssessmentAssetRetentionOwner,
} from '../assessment-media/assessment-asset'
import { assessmentImageAssetReferences } from '../assessment-media/assessment-image-presentation'
import type { FrozenScaleRuntimeSnapshotV1 } from '../assessment-runtime/runtime-snapshot'
import type { ScaleDefinitionV2 } from './scale-definition'

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

export const retainFrozenScaleAssessmentImages = async (input: {
  assessmentId: string
  snapshot: FrozenScaleRuntimeSnapshotV1
  db: AssetDatabase
}): Promise<void> => retainScaleAssessmentImages({
  owner: frozenScaleMediaOwner(input.assessmentId),
  definition: input.snapshot.definition,
  db: input.db,
})
