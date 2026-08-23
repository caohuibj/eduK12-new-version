import { z } from 'zod'

export const gonogoTrialSchema = z
  .object({
    trialType: z.enum(['go', 'nogo']),
    responded: z.boolean(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => value.responded === (value.rtMs != null), {
    message: 'responded must match whether rtMs is present',
  })

export type GonogoTrial = z.infer<typeof gonogoTrialSchema>
