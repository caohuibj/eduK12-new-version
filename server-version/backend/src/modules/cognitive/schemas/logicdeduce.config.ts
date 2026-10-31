import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Logicdeduce v1 配置：中文多条件逻辑推断；题目集随 stimulusSetVersion 冻结。 */
export const logicdeduceConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    stimulusSetVersion: z.string(),
    fixationMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()

export type LogicdeduceConfig = z.infer<typeof logicdeduceConfigSchema>

export const logicdeduceConfigV2Schema = logicdeduceConfigSchema.extend({
 totalTrials:z.number().int().min(1).max(36),
 stimulusSetVersion:z.literal('logicdeduce-zh-v2.0.0'),
})
