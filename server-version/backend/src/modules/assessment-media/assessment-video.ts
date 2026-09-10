import { z } from 'zod'
import { assessmentAssetIdentitySchema, type AssessmentAssetIdentityV1 } from './assessment-asset-identity'
import { assessmentStaticImageAssetIdentitySchema } from './assessment-image'

export const assessmentVideoMimeTypeSchema = z.enum([
  'video/mp4',
  'video/webm',
  'video/ogg',
])

export const assessmentVideoAssetIdentitySchema = assessmentAssetIdentitySchema.extend({
  mimeType: assessmentVideoMimeTypeSchema,
}).strict()

export const assessmentVttAssetIdentitySchema = assessmentAssetIdentitySchema.extend({
  mimeType: z.literal('text/vtt'),
}).strict()

export const assessmentVideoCaptionTrackSchema = z.object({
  asset: assessmentVttAssetIdentitySchema,
  kind: z.enum(['captions', 'subtitles']),
  srcLang: z.string().trim().min(2).max(35),
  label: z.string().trim().min(1).max(120),
  default: z.boolean().optional(),
}).strict()

export const assessmentVideoTranscriptSchema = z.object({
  language: z.string().trim().min(2).max(35),
  text: z.string().trim().min(1).max(50_000),
}).strict()

export const assessmentVideoPresentationSchema = z.object({
  schemaVersion: z.literal(1),
  video: assessmentVideoAssetIdentitySchema,
  poster: assessmentStaticImageAssetIdentitySchema.optional(),
  captions: z.array(assessmentVideoCaptionTrackSchema).max(8).optional(),
  transcript: assessmentVideoTranscriptSchema.optional(),
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().min(1).max(2_000).optional(),
}).strict().superRefine((value, ctx) => {
  const defaults = value.captions?.filter((track) => track.default) || []
  if (defaults.length > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['captions'],
      message: 'Assessment video may declare at most one default caption track',
    })
  }
})

export type AssessmentVideoAssetIdentityV1 = z.infer<typeof assessmentVideoAssetIdentitySchema>
export type AssessmentVttAssetIdentityV1 = z.infer<typeof assessmentVttAssetIdentitySchema>
export type AssessmentVideoCaptionTrackV1 = z.infer<typeof assessmentVideoCaptionTrackSchema>
export type AssessmentVideoPresentationV1 = z.infer<typeof assessmentVideoPresentationSchema>

export const assessmentVideoPresentationAssetReferences = (
  presentation: AssessmentVideoPresentationV1,
): AssessmentAssetIdentityV1[] => {
  const parsed = assessmentVideoPresentationSchema.parse(presentation)
  return [
    parsed.video,
    ...(parsed.poster ? [parsed.poster] : []),
    ...(parsed.captions || []).map((track) => track.asset),
  ]
}
