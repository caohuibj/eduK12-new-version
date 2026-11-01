import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Cancellation v1 配置：视觉划消（限时搜索目标符号，WAIS/WISC Cancellation 结构）。 */
export const cancellationConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    durationMs: z.number().int().positive(),
    stimulusSetVersion: z.string(),
    report: reportMetaSchema,
  })
  .strict()

export type CancellationConfig = z.infer<typeof cancellationConfigSchema>
