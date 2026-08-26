import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const cardsortConfigSchema = z
  .object({
    totalTrials: z.number().int().min(12).max(400),
    switchRatio: z.number().min(0.2).max(0.6),
    blockCount: z.number().int().min(1).max(8),
    cueMs: z.number().int().positive(),
    stimulusMs: z.number().int().positive(),
    isiMs: z.number().int().min(0),
    validRtFloorMs: z.number().int().nonnegative(),
    stimulusSetVersion: z.literal('geometric-cards-v1.0.0'),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => value.totalTrials % value.blockCount === 0, {
    message: 'totalTrials must divide evenly into blockCount',
    path: ['blockCount'],
  })

export type CardsortConfig = z.infer<typeof cardsortConfigSchema>
