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
import {
  frozenFormMediaOwner,
  publishedFormMediaOwner,
} from './form-image.adapter'
import type { FrozenUnitAdmissionV1 } from './admission-snapshot'

const optionVideoPresentations = (options: unknown): AssessmentVideoPresentationV1[] => {
  if (!Array.isArray(options)) return []
  return options.flatMap((option): AssessmentVideoPresentationV1[] => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) return []
    const video = (option as { video?: unknown }).video
    if (video === undefined) return []
    return [assessmentVideoPresentationSchema.parse(video)]
  })
}

export const questionnaireFormSectionVideoPresentations = (definition: unknown): AssessmentVideoPresentationV1[] => {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return []
  const items = (definition as { items?: unknown }).items
  if (!Array.isArray(items)) return []
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    return optionVideoPresentations((item as { options?: unknown }).options)
  })
}

export const compositeFormSectionVideoPresentations = (definition: unknown): AssessmentVideoPresentationV1[] => {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return []
  const items = (definition as { items?: unknown }).items
  if (!Array.isArray(items)) return []
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    return optionVideoPresentations((item as { formOptions?: unknown }).formOptions)
  })
}

export const frozenFormSectionVideoPresentations = (admission: FrozenUnitAdmissionV1): AssessmentVideoPresentationV1[] => {
  const frozen = admission.formSection
  if (!frozen) return []
  return frozen.kind === 'questionnaire'
    ? questionnaireFormSectionVideoPresentations(frozen.definition)
    : compositeFormSectionVideoPresentations(frozen.definition)
}

export const frozenFormSectionVideoReferences = (admission: FrozenUnitAdmissionV1) => (
  frozenFormSectionVideoPresentations(admission).flatMap(assessmentVideoPresentationAssetReferences)
)

export const retainFormSectionVideos = async (input: {
  owner: AssessmentAssetRetentionOwner
  presentations: AssessmentVideoPresentationV1[]
  db?: AssetDatabase
}): Promise<void> => retainAssessmentAssetReferences({
  owner: input.owner,
  references: input.presentations.flatMap(assessmentVideoPresentationAssetReferences),
  db: input.db,
})

export const retainFrozenFormAdmissionVideos = async (
  admission: FrozenUnitAdmissionV1,
  db: AssetDatabase = prisma,
): Promise<void> => {
  const frozen = admission.formSection
  const parent = admission.parent
  if (!frozen || !parent) throw new Error('Frozen Form admission is missing its parent binding')
  if (frozen.kind !== parent.kind) throw new Error('Frozen Form admission parent binding does not match its definition kind')
  const owner = frozenFormMediaOwner(
    frozen.kind === 'questionnaire' ? 'QUESTIONNAIRE' : 'COMPOSITE',
    parent.parentId,
    frozen.id,
  )
  await retainFormSectionVideos({ owner, presentations: frozenFormSectionVideoPresentations(admission), db })
}

export const publishedQuestionnaireFormVideoOwner = (
  ownerId: string,
  definitionHash: string,
): AssessmentAssetRetentionOwner => publishedFormMediaOwner('QUESTIONNAIRE', ownerId, definitionHash)

export const publishedCompositeFormVideoOwner = (
  ownerId: string,
  definitionHash: string,
): AssessmentAssetRetentionOwner => publishedFormMediaOwner('COMPOSITE', ownerId, definitionHash)
