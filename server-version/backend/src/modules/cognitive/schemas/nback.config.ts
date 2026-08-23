import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const nbackConfigSchema = z
  .object({
    nLevels: z.array(z.union([z.literal(1), z.literal(2), z.literal(3)])).min(1).max(3),
    trialCountByN: z.array(z.number().int().min(16).max(80)).min(1).max(3),
    blockCountByN: z.array(z.number().int().min(1).max(6)).min(1).max(3),
    targetRatio: z.number().min(0.2).max(0.4),
    stimulusMs: z.number().int().positive(),
    isiMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => value.nLevels.length === new Set(value.nLevels).size, {
    message: 'nLevels must be unique',
    path: ['nLevels'],
  })
  .refine((value) => value.nLevels.length === value.trialCountByN.length && value.nLevels.length === value.blockCountByN.length, {
    message: 'nLevels, trialCountByN and blockCountByN must have the same length',
    path: ['trialCountByN'],
  })
  .refine((value) => value.trialCountByN.every((count, index) => count % value.blockCountByN[index] === 0), {
    message: 'each trialCountByN must divide evenly into the matching blockCount',
    path: ['blockCountByN'],
  })

export type NbackConfig = z.infer<typeof nbackConfigSchema>
