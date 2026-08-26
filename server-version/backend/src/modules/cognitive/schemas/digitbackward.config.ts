import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const digitbackwardConfigSchema = z.object({
  startSpan: z.number().int().min(2).max(4),
  maxSpan: z.number().int().min(4).max(9),
  trialsPerLevel: z.literal(2),
  digitDisplayMs: z.number().int().positive(),
  digitIntervalMs: z.number().int().nonnegative(),
  readyDurationMs: z.number().int().nonnegative(),
  inactivityGuardMs: z.number().int().positive(),
  stimulusSetVersion: z.string().regex(/^digits-v\d+\.\d+\.\d+$/),
  report: reportMetaSchema,
}).strict().refine((value) => value.maxSpan >= value.startSpan, {
  message: 'maxSpan must be greater than or equal to startSpan',
  path: ['maxSpan'],
})

export type DigitbackwardConfig = z.infer<typeof digitbackwardConfigSchema>
