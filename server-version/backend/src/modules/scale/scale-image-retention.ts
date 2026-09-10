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

/**
 * A Scale frozen runtime is immutable and fully identified by compiledRuntimeHash.
 * Using that stable identity lets concurrent/repeated attempts share one durable
 * media owner while still protecting historical frozen bytes independently of
 * the current published Scale row.
 */
export const frozenScaleRuntimeMediaOwner = (compiledRuntimeHash: string): AssessmentAssetRetentionOwner => ({
  entityType: ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
  entityId: `SCALE_RUNTIME:${compiledRuntimeHash}`,
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

export const retainFrozenScaleRuntimeImages = async (input: {
  compiledRuntimeHash: string
  definition: ScaleDefinitionV2
  db: AssetDatabase
}): Promise<void> => retainScaleAssessmentImages({
  owner: frozenScaleRuntimeMediaOwner(input.compiledRuntimeHash),
  definition: input.definition,
  db: input.db,
})
