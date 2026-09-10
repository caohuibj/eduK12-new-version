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
  frozenFormMediaOwnerFromAdmission,
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

const optionVideoPresentationAt = (
  options: unknown,
  optionIndex: number,
): AssessmentVideoPresentationV1 | null => {
  if (!Array.isArray(options) || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= options.length) return null
  const option = options[optionIndex]
  if (!option || typeof option !== 'object' || Array.isArray(option)) return null
  const video = (option as { video?: unknown }).video
  return video === undefined ? null : assessmentVideoPresentationSchema.parse(video)
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

export const frozenFormOptionVideoPresentation = (
  admission: FrozenUnitAdmissionV1,
  itemId: string,
  optionIndex: number,
): AssessmentVideoPresentationV1 | null => {
  const frozen = admission.formSection
  if (!frozen || !frozen.definition || typeof frozen.definition !== 'object' || Array.isArray(frozen.definition)) return null
  const items = (frozen.definition as { items?: unknown }).items
  if (!Array.isArray(items)) return null
  const item = items.find((entry) => entry && typeof entry === 'object' && !Array.isArray(entry) && (entry as { id?: unknown }).id === itemId)
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  return frozen.kind === 'questionnaire'
    ? optionVideoPresentationAt((item as { options?: unknown }).options, optionIndex)
    : optionVideoPresentationAt((item as { formOptions?: unknown }).formOptions, optionIndex)
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
): Promise<void> => retainFormSectionVideos({
  owner: frozenFormMediaOwnerFromAdmission(admission),
  presentations: frozenFormSectionVideoPresentations(admission),
  db,
})

export const publishedQuestionnaireFormVideoOwner = (
  ownerId: string,
  definitionHash: string,
): AssessmentAssetRetentionOwner => publishedFormMediaOwner('QUESTIONNAIRE', ownerId, definitionHash)

export const publishedCompositeFormVideoOwner = (
  ownerId: string,
  definitionHash: string,
): AssessmentAssetRetentionOwner => publishedFormMediaOwner('COMPOSITE', ownerId, definitionHash)
