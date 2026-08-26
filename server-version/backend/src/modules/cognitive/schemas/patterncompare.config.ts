import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const patterncompareConfigSchema = z
  .object({
    durationSec: z.number().int().min(10).max(180),
    trialTimeoutMs: z.number().int().min(300).max(10000),
    isiMs: z.number().int().min(0).max(5000),
    validRtFloorMs: z.number().int().nonnegative(),
    stimulusSetVersion: z.literal('geometric-v1.0.0'),
    report: reportMetaSchema,
  })
  .strict()

export type PatterncompareConfig = z.infer<typeof patterncompareConfigSchema>
