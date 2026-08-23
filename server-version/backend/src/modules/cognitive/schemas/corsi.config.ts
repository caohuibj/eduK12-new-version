import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const corsiConfigSchema = z
  .object({
    startSpan: z.number().int().min(2).max(5),
    maxSpan: z.number().int().min(3).max(9),
    trialsPerLevel: z.literal(2),
    boardSize: z.literal(9),
    highlightMs: z.number().int().positive(),
    intervalMs: z.number().int().positive(),
    readyDurationMs: z.number().int().positive(),
    inactivityGuardMs: z.number().int().positive(),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => value.maxSpan >= value.startSpan, {
    message: 'maxSpan must be greater than or equal to startSpan',
    path: ['maxSpan'],
  })

export type CorsiConfig = z.infer<typeof corsiConfigSchema>
