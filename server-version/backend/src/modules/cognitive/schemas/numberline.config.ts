import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Numberline v1 配置：0..lineMax 数字线估计，服务端按 scoringVersion 计算误差。 */
export const numberlineConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    lineMax: z.number().int().min(10),
    maxResponseMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()

export type NumberlineConfig = z.infer<typeof numberlineConfigSchema>
