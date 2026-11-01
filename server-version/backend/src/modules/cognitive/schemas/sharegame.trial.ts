import { z } from 'zod'

/** Sharegame 单试次 observable facts；给出量的合法性由服务端校验。 */
export const sharegameTrialSchema = z
  .object({
    endowment: z.number().int().positive(),
    given: z.number().int().min(0),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => value.given <= value.endowment, {
    message: 'given must not exceed the endowment',
    path: ['given'],
  })

export type SharegameTrial = z.infer<typeof sharegameTrialSchema>
