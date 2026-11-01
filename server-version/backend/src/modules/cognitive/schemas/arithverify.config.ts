import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Arithverify v1 配置：加法等式验证（对/错判断），服务端推导正确性。 */
export const arithverifyConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    operandMax: z.number().int().min(2),
    trueRatio: z.number().min(0).max(1),
    fixationMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => {
    const trueCount = Math.round(value.totalTrials * value.trueRatio)
    return trueCount > 0 && trueCount < value.totalTrials
  }, {
    message: 'trueRatio must produce at least one trial in each condition',
    path: ['trueRatio'],
  })

export type ArithverifyConfig = z.infer<typeof arithverifyConfigSchema>
