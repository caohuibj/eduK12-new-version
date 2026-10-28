import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Wordproblem v1 配置：中文数学应用题推理；题目集随 stimulusSetVersion 冻结。 */
export const wordproblemConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    stimulusSetVersion: z.string(),
    fixationMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()

export type WordproblemConfig = z.infer<typeof wordproblemConfigSchema>
