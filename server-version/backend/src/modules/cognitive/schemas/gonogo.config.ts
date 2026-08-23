import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const gonogoConfigSchema = z
  .object({
    totalTrials: z.number().int().min(8).max(400),
    nogoRatio: z.literal(0.25),
    stimulusMs: z.number().int().positive(),
    isiMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()

export type GonogoConfig = z.infer<typeof gonogoConfigSchema>
