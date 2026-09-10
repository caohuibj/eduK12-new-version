import { z } from 'zod'
import type { AssessmentAssetIdentityV1 } from '../../assessment-media/assessment-asset-identity'
import {
  assessmentStaticImageAssetIdentitySchema,
  type AssessmentStaticImageAssetIdentityV1,
} from '../../assessment-media/assessment-image'
import {
  assessmentVideoPresentationAssetReferences,
  assessmentVideoPresentationSchema,
  type AssessmentVideoPresentationV1,
} from '../../assessment-media/assessment-video'

export const cognitiveImagePresentationItemSchema = z.object({
  asset: assessmentStaticImageAssetIdentitySchema,
  altText: z.string().min(1),
  caption: z.string().min(1).optional(),
}).strict()

const cognitiveVideoSlotsSchema = z.object({
  instruction: z.array(assessmentVideoPresentationSchema).min(1).optional(),
  example: z.array(assessmentVideoPresentationSchema).min(1).optional(),
  stimulus: z.array(assessmentVideoPresentationSchema).min(1).optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.instruction?.length && !value.example?.length && !value.stimulus?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Cognitive video presentation must declare at least one video slot',
    })
  }
})

export const cognitivePresentationDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  instruction: z.array(cognitiveImagePresentationItemSchema).min(1).optional(),
  example: z.array(cognitiveImagePresentationItemSchema).min(1).optional(),
  stimulus: z.array(cognitiveImagePresentationItemSchema).min(1).optional(),
  videos: cognitiveVideoSlotsSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (
    !value.instruction?.length
    && !value.example?.length
    && !value.stimulus?.length
    && !value.videos?.instruction?.length
    && !value.videos?.example?.length
    && !value.videos?.stimulus?.length
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Cognitive presentation must declare at least one media slot',
    })
  }
})

export type CognitiveImagePresentationItem = z.infer<typeof cognitiveImagePresentationItemSchema>
export type CognitiveVideoSlotsV1 = z.infer<typeof cognitiveVideoSlotsSchema>
export type CognitivePresentationDefinitionV1 = z.infer<typeof cognitivePresentationDefinitionSchema>
export type CognitiveVideoSlot = keyof CognitiveVideoSlotsV1

export interface CognitiveVideoPresentationEntry {
  key: string
  slot: CognitiveVideoSlot
  index: number
  presentation: AssessmentVideoPresentationV1
}

export const parseCognitivePresentationDefinition = (
  value: unknown,
): CognitivePresentationDefinitionV1 => cognitivePresentationDefinitionSchema.parse(value)

/**
 * Image slot order remains MEDIA-3 compatible: instruction, example, stimulus,
 * then authored array order within each slot. Task code still owns display timing.
 */
export const cognitivePresentationItems = (
  presentation?: CognitivePresentationDefinitionV1,
): CognitiveImagePresentationItem[] => presentation
  ? [
      ...(presentation.instruction ?? []),
      ...(presentation.example ?? []),
      ...(presentation.stimulus ?? []),
    ]
  : []

export const cognitiveImagePresentationAssetReferences = (
  presentation?: CognitivePresentationDefinitionV1,
): AssessmentStaticImageAssetIdentityV1[] => cognitivePresentationItems(presentation).map((item) => item.asset)

const VIDEO_SLOT_ORDER: CognitiveVideoSlot[] = ['instruction', 'example', 'stimulus']

/** Stable keys select frozen video presentations without relying on mutable URLs or ambiguous asset reuse. */
export const cognitiveVideoPresentationEntries = (
  presentation?: CognitivePresentationDefinitionV1,
): CognitiveVideoPresentationEntry[] => {
  if (!presentation?.videos) return []
  return VIDEO_SLOT_ORDER.flatMap((slot) => (
    (presentation.videos?.[slot] ?? []).map((video, index) => ({
      key: `${slot}:${index}`,
      slot,
      index,
      presentation: video,
    }))
  ))
}

/** Video slot order mirrors image slot order without changing task timing semantics. */
export const cognitiveVideoPresentations = (
  presentation?: CognitivePresentationDefinitionV1,
): AssessmentVideoPresentationV1[] => cognitiveVideoPresentationEntries(presentation)
  .map((entry) => entry.presentation)

export const cognitiveVideoPresentationAssetReferences = (
  presentation?: CognitivePresentationDefinitionV1,
): AssessmentAssetIdentityV1[] => cognitiveVideoPresentations(presentation)
  .flatMap((video) => assessmentVideoPresentationAssetReferences(video))

/** Combined frozen-media references used by the existing Cognitive runtime retention owner. */
export const cognitivePresentationAssetReferences = (
  presentation?: CognitivePresentationDefinitionV1,
): AssessmentAssetIdentityV1[] => [
  ...cognitiveImagePresentationAssetReferences(presentation),
  ...cognitiveVideoPresentationAssetReferences(presentation),
]
