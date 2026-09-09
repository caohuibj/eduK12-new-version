import { z } from 'zod'
import { assessmentAssetIdentitySchema } from './assessment-asset-identity'

export const ASSESSMENT_STATIC_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export const assessmentStaticImageMimeTypeSchema = z.enum(ASSESSMENT_STATIC_IMAGE_MIME_TYPES)
export type AssessmentStaticImageMimeType = z.infer<typeof assessmentStaticImageMimeTypeSchema>

export const assessmentStaticImageAssetIdentitySchema = assessmentAssetIdentitySchema.extend({
  mimeType: assessmentStaticImageMimeTypeSchema,
}).strict()
export type AssessmentStaticImageAssetIdentityV1 = z.infer<typeof assessmentStaticImageAssetIdentitySchema>
