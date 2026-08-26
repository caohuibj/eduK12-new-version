import { z } from 'zod'

export const cptTrialSchema = z
  .object({
    blockIndex: z.number().int().min(0),
    stimulus: z.string().min(1).max(8),
    isTarget: z.boolean(),
    responded: z.boolean(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => value.responded === (value.rtMs != null), {
    message: 'responded must match whether rtMs is present',
  })

export type CptTrial = z.infer<typeof cptTrialSchema>
