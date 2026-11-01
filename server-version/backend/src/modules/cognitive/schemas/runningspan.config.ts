import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Runningspan v1 配置：不知道终点、回忆最后 k 项的运行广度。 */
export const runningspanConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    listLengthMin: z.number().int().positive(),
    listLengthMax: z.number().int().positive(),
    recallLength: z.number().int().positive(),
    stimulusMs: z.number().int().positive(),
    isiMs: z.number().int().positive(),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => value.listLengthMin <= value.listLengthMax, {
    message: 'listLengthMin must not exceed listLengthMax',
    path: ['listLengthMin'],
  })
  .refine((value) => value.recallLength < value.listLengthMin, {
    message: 'recallLength must be shorter than the shortest list so the end stays unknown',
    path: ['recallLength'],
  })

export type RunningspanConfig = z.infer<typeof runningspanConfigSchema>
