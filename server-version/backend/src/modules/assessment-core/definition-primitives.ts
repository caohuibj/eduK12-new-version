import { z } from 'zod'
import { assessmentStaticImageAssetIdentitySchema } from '../assessment-media/assessment-image'

/** Portable asset metadata only; rights and entry authorization stay with adapters. */
export const assessmentKeySchema = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/)
export const assessmentImageSchema=z.object({
  asset:assessmentStaticImageAssetIdentitySchema,
  altText:z.string().trim().min(1).max(300),
  caption:z.string().trim().max(1000).optional(),
  rightsStatus:z.enum(['self_authored','authorized','unknown']).default('unknown'),
  rightsNote:z.string().trim().max(2000).default(''),
}).strict()
