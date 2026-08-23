import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const matrixConfigSchema = z.object({
  itemCount: z.union([z.literal(6), z.literal(16), z.literal(24)]),
  optionCount: z.literal(4),
  itemTimeoutMs: z.number().int().positive(),
  validRtFloorMs: z.number().int().nonnegative(),
  stimulusSetVersion: z.literal('matrix-generator-v1.0.0'),
  report: reportMetaSchema,
}).strict()

export type MatrixConfig = z.infer<typeof matrixConfigSchema>
