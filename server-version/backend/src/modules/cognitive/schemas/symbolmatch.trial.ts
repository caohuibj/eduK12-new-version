import { z } from 'zod'

/** Symbolmatch 单试次 observable facts；正确性由服务端按冻结映射推导。 */
export const symbolmatchTrialSchema = z
  .object({
    symbol: z.string().length(1),
    response: z.number().int().min(1).max(9).nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.response === null) === (value.rtMs === null), {
    message: 'response and rtMs must be null together for a timeout',
    path: ['response'],
  })

export type SymbolmatchTrial = z.infer<typeof symbolmatchTrialSchema>
