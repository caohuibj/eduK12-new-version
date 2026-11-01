import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Proofread v1 配置：中文文本校对；题目集随 stimulusSetVersion 冻结。 */
export const proofreadConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    stimulusSetVersion: z.string(),
    fixationMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()

export type ProofreadConfig = z.infer<typeof proofreadConfigSchema>
