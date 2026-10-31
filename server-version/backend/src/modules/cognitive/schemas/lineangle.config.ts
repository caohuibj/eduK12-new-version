import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Lineangle v1 配置：目标线段与选项的角度匹配（JLO 结构）。 */
export const lineangleConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    angleStepDeg: z.number().int().min(5).max(45),
    optionCount: z.number().int().min(2).max(13),
    minAngleSepSteps: z.number().int().min(1),
    fixationMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()

export type LineangleConfig = z.infer<typeof lineangleConfigSchema>
