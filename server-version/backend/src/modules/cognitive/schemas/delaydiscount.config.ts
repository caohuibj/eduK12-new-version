import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Delaydiscount v1 配置：逐带二分调整的跨期选择（现在小额 vs 延后大额）。 */
export const delaydiscountConfigSchema = z
  .object({
    delayBands: z.array(z.number().int().positive()).min(1).max(4),
    delayedAmount: z.number().int().positive(),
    bisectionSteps: z.number().int().positive(),
    fixationMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => new Set(value.delayBands).size === value.delayBands.length, {
    message: 'delayBands must be distinct',
    path: ['delayBands'],
  })

export type DelaydiscountConfig = z.infer<typeof delaydiscountConfigSchema>
