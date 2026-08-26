import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const mentalrotationConfigSchema = z.object({
  totalTrials: z.union([z.literal(12), z.literal(40), z.literal(80)]),
  stimulusMs: z.number().int().positive(),
  isiMs: z.number().int().nonnegative(),
  validRtFloorMs: z.number().int().nonnegative(),
  stimulusSetVersion: z.literal('rotation-objects-v1.0.0'),
  report: reportMetaSchema,
}).strict()

export type MentalrotationConfig = z.infer<typeof mentalrotationConfigSchema>
