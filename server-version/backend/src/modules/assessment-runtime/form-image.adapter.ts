import type { Response } from 'express'
import { prisma } from '../../config/database'
import type { AssetDatabase } from '../../services/assetStorage'
import {
  ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
  ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
  ASSESSMENT_PUBLISHED_DEFINITION_REFERENCE_TYPE,
  ASSESSMENT_PUBLISHED_MEDIA_FIELD,
  assertAssessmentAssetReferencesReady,
  findFrozenAssessmentAssetReference,
  retainAssessmentAssetReferences,
  type AssessmentAssetRetentionOwner,
} from '../assessment-media/assessment-asset'
import {
  assessmentImageAssetReferences,
  assessmentImagePresentationListSchema,
} from '../assessment-media/assessment-image-presentation'
import { serveAssessmentImageContent } from '../assessment-media/assessment-image-delivery'
import type { FrozenUnitAdmissionV1 } from './admission-snapshot'

const optionImageReferences = (options: unknown) => {
  if (!Array.isArray(options)) return []
  return options.flatMap((option) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) return []
    const images = (option as { images?: unknown }).images
    if (images === undefined) return []
    return assessmentImageAssetReferences(assessmentImagePresentationListSchema.parse(images))
  })
}

export const questionnaireFormSectionImageReferences = (definition: unknown) => {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return []
  const items = (definition as { items?: unknown }).items
  if (!Array.isArray(items)) return []
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    return optionImageReferences((item as { options?: unknown }).options)
  })
}

export const compositeFormSectionImageReferences = (definition: unknown) => {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return []
  const items = (definition as { items?: unknown }).items
  if (!Array.isArray(items)) return []
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    return optionImageReferences((item as { formOptions?: unknown }).formOptions)
  })
}

export const frozenFormSectionImageReferences = (admission: FrozenUnitAdmissionV1) => {
  const frozen = admission.formSection
  if (!frozen) return []
  return frozen.kind === 'questionnaire'
    ? questionnaireFormSectionImageReferences(frozen.definition)
    : compositeFormSectionImageReferences(frozen.definition)
}

export const assertFormSectionImagesReady = async (
  references: ReturnType<typeof questionnaireFormSectionImageReferences>,
  db: AssetDatabase = prisma,
): Promise<void> => assertAssessmentAssetReferencesReady(references, db)

export const publishedFormMediaOwner = (
  kind: 'QUESTIONNAIRE' | 'COMPOSITE',
  ownerId: string,
  definitionHash: string,
): AssessmentAssetRetentionOwner => ({
  entityType: ASSESSMENT_PUBLISHED_DEFINITION_REFERENCE_TYPE,
  entityId: `${kind}:${ownerId}:${definitionHash}`,
  field: ASSESSMENT_PUBLISHED_MEDIA_FIELD,
})

export const frozenFormMediaOwner = (
  kind: 'QUESTIONNAIRE' | 'COMPOSITE',
  attemptId: string,
  sectionId: string,
): AssessmentAssetRetentionOwner => ({
  entityType: ASSESSMENT_FROZEN_RUNTIME_REFERENCE_TYPE,
  entityId: `${kind}:${attemptId}:FORM_SECTION:${sectionId}`,
  field: ASSESSMENT_FROZEN_RUNTIME_MEDIA_FIELD,
})

export const retainFormSectionImages = async (input: {
  owner: AssessmentAssetRetentionOwner
  references: ReturnType<typeof questionnaireFormSectionImageReferences>
  db?: AssetDatabase
}): Promise<void> => retainAssessmentAssetReferences({
  owner: input.owner,
  references: input.references,
  db: input.db,
})

const frozenFormMediaOwnerFromAdmission = (admission: FrozenUnitAdmissionV1): AssessmentAssetRetentionOwner => {
  const frozen = admission.formSection
  const parent = admission.parent
  if (!frozen || !parent) throw new Error('Frozen Form admission is missing its parent binding')
  if (frozen.kind !== parent.kind) throw new Error('Frozen Form admission parent binding does not match its definition kind')
  return frozenFormMediaOwner(
    frozen.kind === 'questionnaire' ? 'QUESTIONNAIRE' : 'COMPOSITE',
    parent.parentId,
    frozen.id,
  )
}

export const retainFrozenFormAdmissionImages = async (
  admission: FrozenUnitAdmissionV1,
  db: AssetDatabase = prisma,
): Promise<void> => retainFormSectionImages({
  owner: frozenFormMediaOwnerFromAdmission(admission),
  references: frozenFormSectionImageReferences(admission),
  db,
})

export const serveFrozenFormSectionImage = async (input: {
  admission: FrozenUnitAdmissionV1
  assetId: string
  res: Response
  db?: AssetDatabase
}): Promise<void> => {
  const references = frozenFormSectionImageReferences(input.admission)
  const reference = findFrozenAssessmentAssetReference(references, input.assetId)
  if (!reference) throw new Error('Assessment image is not referenced by the frozen Form section')
  await serveAssessmentImageContent({ reference, res: input.res, db: input.db })
}
