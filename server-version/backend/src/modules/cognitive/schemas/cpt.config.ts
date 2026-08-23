import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const cptConfigSchema = z
  .object({
    totalTrials: z.number().int().min(12).max(480),
    targetRatio: z.number().min(0.05).max(0.5),
    blockCount: z.number().int().min(1).max(12),
    stimulusMs: z.number().int().positive(),
    isiMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    perseverationRtMs: z.literal(100),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => value.totalTrials % value.blockCount === 0, {
    message: 'totalTrials must divide evenly into blockCount',
    path: ['blockCount'],
  })

export type CptConfig = z.infer<typeof cptConfigSchema>
