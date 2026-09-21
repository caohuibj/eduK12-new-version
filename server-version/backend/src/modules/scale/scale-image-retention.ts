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
import {
  assessmentVideoPresentationAssetReferences,
  assessmentVideoPresentationSchema,
} from '../assessment-media/assessment-video'
import type { VersionedFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import type { ScaleDefinitionV2 } from './scale-definition'

export const scaleAssessmentImageReferences = (definition: ScaleDefinitionV2) => (
  definition.items.flatMap((item) => assessmentImageAssetReferences(item.images))
)

const scaleAssessmentVideoReferencesForRetention = (definition: ScaleDefinitionV2) => (
  definition.items.flatMap((item) => {
    const video = (item as typeof item & { video?: unknown }).video
    if (video === undefined) return []
    return assessmentVideoPresentationAssetReferences(assessmentVideoPresentationSchema.parse(video))
  })
)

export const scaleAssessmentMediaReferences = (definition: ScaleDefinitionV2) => ([
  ...scaleAssessmentImageReferences(definition),
  ...scaleAssessmentVideoReferencesForRetention(definition),
])

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

// Compatibility name retained for MEDIA-2 callers. The durable owner is a
// generic media owner, so the same transaction now retains both image and
// video presentation assets without adding a second lifecycle.
export const retainScaleAssessmentImages = async (input: {
  owner: AssessmentAssetRetentionOwner
  definition: ScaleDefinitionV2
  db?: AssetDatabase
}): Promise<void> => retainAssessmentAssetReferences({
  owner: input.owner,
  references: scaleAssessmentMediaReferences(input.definition),
  db: input.db,
})

export const retainFrozenScaleAssessmentImages = async (input: {
  assessmentId: string
  snapshot: VersionedFrozenScaleRuntimeSnapshot
  db: AssetDatabase
}): Promise<void> => retainScaleAssessmentImages({
  owner: frozenScaleMediaOwner(input.assessmentId),
  definition: input.snapshot.definition,
  db: input.db,
})
