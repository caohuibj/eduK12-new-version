import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Readingcomp v1 配置：中文阅读理解；题目集随 stimulusSetVersion 冻结。 */
export const readingcompConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    stimulusSetVersion: z.string(),
    fixationMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()

export type ReadingcompConfig = z.infer<typeof readingcompConfigSchema>
