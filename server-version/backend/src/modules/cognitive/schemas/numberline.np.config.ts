import { z } from 'zod'
import { reportMetaSchema } from './report-meta'
import { NUMBERLINE_NP_STIMULUS_VERSION } from '../tasks/numberline/np-generator'

export const numberlineNpConfigSchema = z.object({
  totalTrials: z.literal(6),
  lineMax: z.union([z.literal(100), z.literal(1000)]),
  targetSet: z.enum(['A', 'B']),
  stimulusSetVersion: z.literal(NUMBERLINE_NP_STIMULUS_VERSION),
  maxResponseMs: z.union([z.literal(4000), z.literal(30000)]),
  validRtFloorMs: z.number().int().nonnegative(),
  report: reportMetaSchema,
}).strict()
export type NumberlineNpConfig = z.infer<typeof numberlineNpConfigSchema>
