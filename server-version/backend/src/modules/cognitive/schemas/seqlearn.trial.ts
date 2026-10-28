import { z } from 'zod'

/** Seqlearn 单试次 observable facts；位置合法性（模式块）与正确性由服务端推导。 */
export const seqlearnTrialSchema = z
  .object({
    position: z.number().int().min(1).max(4),
    response: z.number().int().min(1).max(4).nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.response === null) === (value.rtMs === null), {
    message: 'response and rtMs must be null together for a timeout',
    path: ['response'],
  })

export type SeqlearnTrial = z.infer<typeof seqlearnTrialSchema>
