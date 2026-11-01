import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Letternumseries v1 配置：字母-数字序列（WAIS LNS 结构）；每试次字母数+数字数固定。 */
export const letternumseriesConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    lettersPerTrial: z.number().int().min(1).max(9),
    digitsPerTrial: z.number().int().min(1).max(9),
    stimulusMs: z.number().int().positive(),
    isiMs: z.number().int().positive(),
    report: reportMetaSchema,
  })
  .strict()

export type LetternumseriesConfig = z.infer<typeof letternumseriesConfigSchema>
