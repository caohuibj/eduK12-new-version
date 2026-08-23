import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const taskswitchConfigSchema = z
  .object({
    totalTrials: z.number().int().min(24).max(400),
    switchRatio: z.number().min(0.3).max(0.7),
    blockCount: z.number().int().min(1).max(8),
    includePureBlocks: z.boolean(),
    cueMs: z.number().int().positive(),
    stimulusMs: z.number().int().positive(),
    isiMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => value.totalTrials % value.blockCount === 0, {
    message: 'totalTrials must divide evenly into blockCount',
    path: ['blockCount'],
  })
  .refine((value) => !value.includePureBlocks || value.blockCount >= 4, {
    message: 'pure blocks require at least 4 blocks',
    path: ['includePureBlocks'],
  })

export type TaskswitchConfig = z.infer<typeof taskswitchConfigSchema>
