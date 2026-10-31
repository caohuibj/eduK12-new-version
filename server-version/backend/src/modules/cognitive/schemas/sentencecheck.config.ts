import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Sentencecheck v1 配置：句图相符判断（语法推理），服务端推导陈述真伪。 */
export const sentencecheckConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    trueRatio: z.number().min(0).max(1),
    negationRatio: z.number().min(0).max(1),
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

export type SentencecheckConfig = z.infer<typeof sentencecheckConfigSchema>
