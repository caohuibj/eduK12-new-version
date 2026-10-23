import {assertTrainingMaterialsUsable} from '../assessment-media/training-materials'
import type {Prisma} from '@prisma/client'
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
import type { RawScoreFeedback } from './raw-score-feedback'
import type { ScaleDefinitionV2 } from './scale-definition'

export const scaleMaterialLists=(definition:ScaleDefinitionV2)=>[
  ...definition.items.map(item=>item.materials),
  ...(definition.report.rawScoreFeedback?.rules.flatMap(rule=>[...rule.ranges,...(rule.fallback?[rule.fallback]:[])].map(content=>content.materials))??[]),
]
export const scaleStimulusMaterialReferences=(definition:ScaleDefinitionV2)=>definition.items.flatMap(item=>item.materials??[]).map(item=>item.asset)
export const scaleReportMaterialReferences=(definition:ScaleDefinitionV2)=>definition.report.rawScoreFeedback?.rules.flatMap(rule=>[...rule.ranges,...(rule.fallback?[rule.fallback]:[])].flatMap(content=>content.materials??[])).map(item=>item.asset)??[]
export const scaleAssessmentImageReferences = (definition: ScaleDefinitionV2) => (
  definition.items.flatMap((item) => assessmentImageAssetReferences(item.images))
)

// Report media must be pinned but never added to the attempt/stimulus allowlist.
export const rawScoreFeedbackImages = (feedback: RawScoreFeedback | undefined) => (
  feedback?.rules.flatMap(rule => [
    ...rule.ranges.flatMap(range => range.images ?? []), ...(rule.fallback?.images ?? []),
  ]) ?? []
)
export const scaleReportImageReferences = (definition: ScaleDefinitionV2) => (
  assessmentImageAssetReferences(rawScoreFeedbackImages(definition.report?.rawScoreFeedback))
)
export const assertScaleReportImagesOwned = async (
  definition: ScaleDefinitionV2, ownerId: string, db: AssetDatabase = prisma, requireRights=false,
): Promise<void> => {
  const references = scaleReportImageReferences(definition)
  const lists=scaleMaterialLists(definition)
  if(lists.some(list=>list?.length)){
    if(db===prisma)await prisma.$transaction(tx=>assertTrainingMaterialsUsable(tx,ownerId,lists,requireRights))
    else await assertTrainingMaterialsUsable(db as unknown as Prisma.TransactionClient,ownerId,lists,requireRights)
  }
  if (!references.length) return
  const ids = [...new Set(references.map(reference => reference.assetId))]
  const assets = await db.storedAsset.findMany({
    where: { id: { in: ids }, ownerId, deletedAt: null, accessScope: 'PRIVATE' },
    select: { id: true },
  })
  if (assets.length !== ids.length) throw new Error('报告图片必须来自量表作者自己的素材库')
  await assertAssessmentAssetReferencesReady(references, db)
}

const scaleAssessmentVideoReferencesForRetention = (definition: ScaleDefinitionV2) => (
  definition.items.flatMap((item) => {
    const video = (item as typeof item & { video?: unknown }).video
    if (video === undefined) return []
    return assessmentVideoPresentationAssetReferences(assessmentVideoPresentationSchema.parse(video))
  })
)

export const scaleAssessmentMediaReferences = (definition: ScaleDefinitionV2) => ([
  ...scaleAssessmentImageReferences(definition),
  ...scaleStimulusMaterialReferences(definition),
  ...scaleReportMaterialReferences(definition),
  ...scaleReportImageReferences(definition),
  ...scaleAssessmentVideoReferencesForRetention(definition),
])

export const assertScaleAssessmentImagesReady = async (
  definition: ScaleDefinitionV2,
  db: AssetDatabase = prisma,
): Promise<void> => assertAssessmentAssetReferencesReady([...scaleAssessmentImageReferences(definition), ...scaleReportImageReferences(definition)], db)

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
