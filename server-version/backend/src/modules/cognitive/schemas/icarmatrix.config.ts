import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Icarmatrix v1 配置：3×3 图形矩阵推理（冻结题库 + 种子生成双轨）。 */
export const icarmatrixConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    stimulusSetVersion: z.string(),
    fixationMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()

export type IcarmatrixConfig = z.infer<typeof icarmatrixConfigSchema>
