import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Semanticfluency v1 配置：类别语义流畅性（限时列举 + 冻结词库校验）。 */
export const semanticfluencyConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    durationMs: z.number().int().positive(),
    stimulusSetVersion: z.string(),
    report: reportMetaSchema,
  })
  .strict()

export type SemanticfluencyConfig = z.infer<typeof semanticfluencyConfigSchema>
