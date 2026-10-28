import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Wordanalogy v1 配置：中文言语类比推理；题目集随 stimulusSetVersion 冻结。 */
export const wordanalogyConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    stimulusSetVersion: z.string(),
    fixationMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()

export type WordanalogyConfig = z.infer<typeof wordanalogyConfigSchema>
