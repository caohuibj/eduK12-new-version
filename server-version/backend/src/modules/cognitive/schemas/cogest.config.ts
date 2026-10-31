import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Cogest v1 配置：认知估计；题目集随 stimulusSetVersion 冻结。 */
export const cogestConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    stimulusSetVersion: z.string(),
    fixationMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()

export type CogestConfig = z.infer<typeof cogestConfigSchema>
