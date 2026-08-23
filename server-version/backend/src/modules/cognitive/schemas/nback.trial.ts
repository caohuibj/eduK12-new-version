import { z } from 'zod'

export const nbackTrialSchema = z
  .object({
    blockIndex: z.number().int().min(0),
    nLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    stimulus: z.string().min(1).max(8),
    target: z.boolean(),
    responded: z.boolean(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => value.responded === (value.rtMs != null), {
    message: 'responded must match whether rtMs is present',
  })

export type NbackTrial = z.infer<typeof nbackTrialSchema>
