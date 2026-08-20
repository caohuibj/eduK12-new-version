import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Stroop v1 配置：固定短版，服务端按 scoringVersion 计算结果。 */
export const stroopConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    congruentRatio: z.number().min(0).max(1),
    fixationMs: z.number().int().positive(),
    stimulusDurationMs: z.number().int().positive(),
    isiMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => {
    const congruentCount = Math.round(value.totalTrials * value.congruentRatio)
    return congruentCount > 0 && congruentCount < value.totalTrials
  }, {
    message: 'congruentRatio must produce at least one trial in each condition',
    path: ['congruentRatio'],
  })

export type StroopConfig = z.infer<typeof stroopConfigSchema>
