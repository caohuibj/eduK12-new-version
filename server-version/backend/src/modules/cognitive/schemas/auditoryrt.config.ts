import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Auditoryrt v1 配置：简单听觉反应时（听觉加工速度；Donders a-reaction 传统）。 */
export const auditoryrtConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    foreperiodMinMs: z.number().int().positive(),
    foreperiodMaxMs: z.number().int().positive(),
    toneFrequencyHz: z.number().int().positive(),
    toneDurationMs: z.number().int().positive(),
    maxRtWindowMs: z.number().int().positive(),
    interTrialIntervalMs: z.number().int().min(0),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => value.foreperiodMaxMs >= value.foreperiodMinMs, {
    message: 'foreperiodMaxMs must be >= foreperiodMinMs',
    path: ['foreperiodMaxMs'],
  })

export type AuditoryrtConfig = z.infer<typeof auditoryrtConfigSchema>
