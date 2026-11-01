import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Auditorynback v1 配置：听觉 n-back（纯音序列；听觉工作记忆）。 */
export const auditorynbackConfigSchema = z
  .object({
    nLevel: z.number().int().min(1).max(3),
    totalTrials: z.number().int().positive(),
    targetRatio: z.number().min(0).max(1),
    stimulusMs: z.number().int().positive(),
    isiMs: z.number().int().positive(),
    toneFrequenciesHz: z.array(z.number().int().positive()).min(3).max(6),
    report: reportMetaSchema,
  })
  .strict()

export type AuditorynbackConfig = z.infer<typeof auditorynbackConfigSchema>
