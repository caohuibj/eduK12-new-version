import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Timecopy v1 配置：时间间隔复制（观察目标间隔后按键复制）。 */
export const timecopyConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    targetMinMs: z.number().int().min(500),
    targetMaxMs: z.number().int().max(20000),
    maxResponseMs: z.number().int().positive(),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => value.targetMinMs < value.targetMaxMs && value.maxResponseMs > value.targetMaxMs, {
    message: 'targetMinMs < targetMaxMs < maxResponseMs is required',
    path: ['targetMaxMs'],
  })

export type TimecopyConfig = z.infer<typeof timecopyConfigSchema>
