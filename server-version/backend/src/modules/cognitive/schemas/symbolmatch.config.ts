import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Symbolmatch v1 配置：符号-数字配对（编码）；映射表随 config 冻结。 */
export const symbolmatchConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    symbolDigitMap: z.array(z.tuple([z.string().length(1), z.number().int().min(1).max(9)])).length(5),
    fixationMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => {
    const symbols = value.symbolDigitMap.map(([symbol]) => symbol)
    const digits = value.symbolDigitMap.map(([, digit]) => digit)
    return new Set(symbols).size === 5 && new Set(digits).size === 5
  }, {
    message: 'symbolDigitMap must pair five distinct symbols with five distinct digits',
    path: ['symbolDigitMap'],
  })

export type SymbolmatchConfig = z.infer<typeof symbolmatchConfigSchema>
