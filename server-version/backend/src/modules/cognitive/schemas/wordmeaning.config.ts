import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Wordmeaning v1 配置：中文词汇理解；题目集随 stimulusSetVersion 冻结。 */
export const wordmeaningConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    stimulusSetVersion: z.string(),
    fixationMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()

export type WordmeaningConfig = z.infer<typeof wordmeaningConfigSchema>
