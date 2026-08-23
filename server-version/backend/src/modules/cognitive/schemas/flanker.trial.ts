import { z } from 'zod'

export const flankerTrialSchema = z
  .object({
    targetDirection: z.enum(['left', 'right']),
    flankerDirection: z.enum(['left', 'right']),
    response: z.enum(['left', 'right']).nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.response == null) === (value.rtMs == null), {
    message: 'response and rtMs must both be present or both be null',
  })

export type FlankerTrial = z.infer<typeof flankerTrialSchema>
