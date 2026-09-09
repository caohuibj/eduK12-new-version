import { z } from 'zod'

export const assessmentAssetIdSchema = z.string().min(1).max(200).refine((value) => (
  !/^https?:\/\//iu.test(value)
  && !/^data:/iu.test(value)
  && !value.includes('/')
), { message: 'Assessment asset must reference an internal StoredAsset identity' })

export const assessmentAssetIdentitySchema = z.object({
  assetId: assessmentAssetIdSchema,
  contentHash: z.string().regex(/^[0-9a-f]{64}$/u, 'Assessment asset contentHash must be a lowercase sha256 digest'),
  mimeType: z.string().min(1).max(200),
}).strict()

export type AssessmentAssetIdentityV1 = z.infer<typeof assessmentAssetIdentitySchema>
