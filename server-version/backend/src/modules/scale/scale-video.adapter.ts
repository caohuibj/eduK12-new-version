import { prisma } from '../../config/database'
import type { AssetDatabase } from '../../services/assetStorage'
import {
  type AssessmentAssetRetentionOwner,
  retainAssessmentAssetReferences,
} from '../assessment-media/assessment-asset'
import {
  assessmentVideoPresentationAssetReferences,
  assessmentVideoPresentationSchema,
  type AssessmentVideoPresentationV1,
} from '../assessment-media/assessment-video'
import type { FrozenScaleRuntimeSnapshotV1 } from '../assessment-runtime/runtime-snapshot'
import type { ScaleDefinitionV2 } from './scale-definition'
import { frozenScaleMediaOwner, publishedScaleMediaOwner } from './scale-image-retention'

export const scaleItemVideoPresentation = (
  definition: ScaleDefinitionV2,
  itemCode: string,
): AssessmentVideoPresentationV1 | null => {
  const item = definition.items.find((candidate) => candidate.itemCode === itemCode)
  if (!item) return null
  const video = (item as typeof item & { video?: unknown }).video
  return video === undefined ? null : assessmentVideoPresentationSchema.parse(video)
}

export const scaleAssessmentVideoPresentations = (definition: ScaleDefinitionV2): AssessmentVideoPresentationV1[] => (
  definition.items.flatMap((item): AssessmentVideoPresentationV1[] => {
    const presentation = scaleItemVideoPresentation(definition, item.itemCode)
    return presentation ? [presentation] : []
  })
)

export const scaleAssessmentVideoReferences = (definition: ScaleDefinitionV2) => (
  scaleAssessmentVideoPresentations(definition).flatMap(assessmentVideoPresentationAssetReferences)
)

export const retainScaleAssessmentVideos = async (input: {
  owner: AssessmentAssetRetentionOwner
  definition: ScaleDefinitionV2
  db?: AssetDatabase
}): Promise<void> => retainAssessmentAssetReferences({
  owner: input.owner,
  references: scaleAssessmentVideoReferences(input.definition),
  db: input.db,
})

export const retainFrozenScaleAssessmentVideos = async (input: {
  assessmentId: string
  snapshot: FrozenScaleRuntimeSnapshotV1
  db: AssetDatabase
}): Promise<void> => retainScaleAssessmentVideos({
  owner: frozenScaleMediaOwner(input.assessmentId),
  definition: input.snapshot.definition,
  db: input.db,
})

export const publishedScaleVideoOwner = publishedScaleMediaOwner
