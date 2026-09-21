import { z } from 'zod'

export const cardsortTrialSchema = z
  .object({
    ruleCue: z.enum(['color', 'shape']),
    stimulusColor: z.enum(['red', 'blue']),
    stimulusShape: z.enum(['circle', 'star']),
    response: z.enum(['left', 'right']).nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
    timedOut: z.boolean(),
  })
  .strict()
  .refine((value) => (value.response == null) === (value.rtMs == null), {
    message: 'response and rtMs must both be present or both be null',
  })

export type CardsortTrial = z.infer<typeof cardsortTrialSchema>
