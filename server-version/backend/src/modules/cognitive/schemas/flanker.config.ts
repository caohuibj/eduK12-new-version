import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const flankerConfigSchema = z
  .object({
    totalTrials: z.number().int().min(8).max(400),
    congruentRatio: z.literal(0.5),
    stimulusMs: z.number().int().positive(),
    isiMs: z.number().int().min(0),
    validRtFloorMs: z.number().int().nonnegative(),
    stimulusSetVersion: z.literal('arrows-v1.0.0'),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => value.totalTrials % 4 === 0, {
    message: 'totalTrials must be divisible by 4 for condition/direction balance',
    path: ['totalTrials'],
  })

export type FlankerConfig = z.infer<typeof flankerConfigSchema>
