import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Ufov v1 配置：有用视野（中心判别 + 周边定位双重任务，BrainHQ Double Decision 简化版）。 */
export const ufovConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    stimulusMs: z.number().int().positive(),
    fixationMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()

export type UfovConfig = z.infer<typeof ufovConfigSchema>
