import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Trustgame v1 配置：最后通牒式响应者决策；每轮分给自己额度随 config 冻结。 */
export const trustgameConfigSchema = z
  .object({
    offers: z.array(z.number().int().positive()).min(1).max(12),
    potTotal: z.number().int().positive(),
    fixationMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => value.offers.every((offer) => offer < value.potTotal), {
    message: 'each offer must be strictly less than the pot total',
    path: ['offers'],
  })

export type TrustgameConfig = z.infer<typeof trustgameConfigSchema>
