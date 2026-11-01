import { z } from 'zod'

/** Proofread 单试次 observable facts；正确性由服务端按冻结题库推导。 */
export const proofreadTrialSchema = z
  .object({
    itemId: z.string(),
    responseIndex: z.number().int().min(0).max(3).nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.responseIndex === null) === (value.rtMs === null), {
    message: 'responseIndex and rtMs must be null together for a timeout',
    path: ['responseIndex'],
  })

export type ProofreadTrial = z.infer<typeof proofreadTrialSchema>
