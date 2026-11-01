import { z } from 'zod'

/** Trustgame 单试次 observable facts；公平划分与接受/拒绝由服务端推导。 */
export const trustgameTrialSchema = z
  .object({
    roundIndex: z.number().int().min(0),
    offerToSelf: z.number().int().positive(),
    response: z.enum(['accept', 'reject']).nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.response === null) === (value.rtMs === null), {
    message: 'response and rtMs must be null together for a timeout',
    path: ['response'],
  })

export type TrustgameTrial = z.infer<typeof trustgameTrialSchema>
