import { z } from 'zod'
import {
  assessmentStaticImageAssetIdentitySchema,
  type AssessmentStaticImageAssetIdentityV1,
} from '../../assessment-media/assessment-image'

export const cognitiveImagePresentationItemSchema = z.object({
  asset: assessmentStaticImageAssetIdentitySchema,
  altText: z.string().min(1),
  caption: z.string().min(1).optional(),
}).strict()

export const cognitivePresentationDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  instruction: z.array(cognitiveImagePresentationItemSchema).min(1).optional(),
  example: z.array(cognitiveImagePresentationItemSchema).min(1).optional(),
  stimulus: z.array(cognitiveImagePresentationItemSchema).min(1).optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.instruction?.length && !value.example?.length && !value.stimulus?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Cognitive presentation must declare at least one image slot',
    })
  }
})

export type CognitiveImagePresentationItem = z.infer<typeof cognitiveImagePresentationItemSchema>
export type CognitivePresentationDefinitionV1 = z.infer<typeof cognitivePresentationDefinitionSchema>

export const parseCognitivePresentationDefinition = (
  value: unknown,
): CognitivePresentationDefinitionV1 => cognitivePresentationDefinitionSchema.parse(value)

/**
 * Slot order is intentionally fixed and array order is authoritative within a
 * slot. Cognitive task code still decides when example/stimulus content is
 * shown; this adapter only freezes presentation identity.
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

export const cognitivePresentationAssetReferences = (
  presentation?: CognitivePresentationDefinitionV1,
): AssessmentStaticImageAssetIdentityV1[] => cognitivePresentationItems(presentation).map((item) => item.asset)
