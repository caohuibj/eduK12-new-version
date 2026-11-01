import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Sizecongruity v1 配置：数字大小比较（数值 × 物理大小一致性），服务端推导条件与正确性。 */
export const sizecongruityConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    congruentRatio: z.number().min(0).max(1),
    minDigit: z.number().int().min(0),
    maxDigit: z.number().int().max(99),
    minGap: z.number().int().min(1),
    fontLargeRem: z.number().positive(),
    fontSmallRem: z.number().positive(),
    fixationMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => value.minGap >= 1 && value.minDigit + value.minGap <= value.maxDigit, {
    message: 'digit range must allow pairs with the required gap',
    path: ['minGap'],
  })
  .refine((value) => {
    const congruentCount = Math.round(value.totalTrials * value.congruentRatio)
    return congruentCount > 0 && congruentCount < value.totalTrials
  }, {
    message: 'congruentRatio must produce at least one trial in each condition',
    path: ['congruentRatio'],
  })

export type SizecongruityConfig = z.infer<typeof sizecongruityConfigSchema>
