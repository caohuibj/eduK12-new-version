import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** The reviewed pilot has seven unique items; matrix size carries no age claim. */
export const icarmatrixV21ConfigSchema = z.object({
  totalTrials: z.number().int().min(4).max(7),
  matrixType: z.literal('3x3'),
  stimulusSetVersion: z.literal('matgen-reviewed-v1.0.0'),
  fixationMs: z.number().int().min(0),
  timeoutMs: z.number().int().positive(),
  validRtFloorMs: z.number().int().min(0),
  report: reportMetaSchema.extend({ referenceMode: z.literal('none') }),
}).strict().refine(config => config.validRtFloorMs < config.timeoutMs, {
  message: 'valid RT floor must be below the response deadline', path: ['validRtFloorMs'],
})

export type IcarmatrixV21Config = z.infer<typeof icarmatrixV21ConfigSchema>
