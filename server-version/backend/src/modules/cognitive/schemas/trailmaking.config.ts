import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const trailmakingConfigSchema = z
  .object({
    form: z.enum(['A', 'AB']),
    partAItemCount: z.number().int().min(8).max(24),
    partBItemCount: z.number().int().min(0).max(24),
    stepTimeoutMs: z.number().int().min(5000).max(30000),
    stimulusSetVersion: z.literal('trailmaking-generated-v1.0.0'),
    report: reportMetaSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.form === 'A' && value.partBItemCount !== 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['partBItemCount'], message: 'form A must not include part B items' })
    }
    if (value.form === 'AB' && value.partBItemCount < 8) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['partBItemCount'], message: 'form AB requires at least 8 part B items' })
    }
  })

export type TrailmakingConfig = z.infer<typeof trailmakingConfigSchema>
