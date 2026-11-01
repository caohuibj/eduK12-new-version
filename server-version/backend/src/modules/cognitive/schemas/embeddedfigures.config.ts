import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Embeddedfigures v1 配置：隐藏图形查找（Witkin 场独立性 / pymetrics Shapes 同族）。 */
export const embeddedfiguresConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    stimulusSetVersion: z.string(),
    showTargetMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()

export type EmbeddedfiguresConfig = z.infer<typeof embeddedfiguresConfigSchema>
