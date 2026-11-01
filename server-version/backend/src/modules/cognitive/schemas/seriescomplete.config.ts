import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Seriescomplete v1 配置：中文数列完成；题目集随 stimulusSetVersion 冻结。 */
export const seriescompleteConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    stimulusSetVersion: z.string(),
    fixationMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()

export type SeriescompleteConfig = z.infer<typeof seriescompleteConfigSchema>
