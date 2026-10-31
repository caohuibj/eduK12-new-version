import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Visualwm v1 配置：变化觉察范式（Luck & Vogel 1997 结构）。 */
export const visualwmConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    studyMs: z.number().int().positive(),
    retentionMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()

export type VisualwmConfig = z.infer<typeof visualwmConfigSchema>
