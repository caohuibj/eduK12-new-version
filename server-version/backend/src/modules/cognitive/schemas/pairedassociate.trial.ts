import { z } from 'zod'

export const pairedassociateTrialSchema = z.object({
  phase: z.enum(['learning', 'delayed']),
  roundIndex: z.number().int().nonnegative(),
  responses: z.array(z.object({
    itemId: z.string().regex(/^pair-\d{2}$/),
    selectedPosition: z.number().int().nonnegative().nullable(),
  }).strict()).min(6).max(18),
  responseDurationMs: z.number().int().nonnegative(),
  interrupted: z.boolean(),
}).strict()

export type PairedassociateTrial = z.infer<typeof pairedassociateTrialSchema>
