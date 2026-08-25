import { z } from 'zod'

export const reversallearningTrialSchema = z.object({
  choice: z.enum(['left', 'right']).nullable(),
  rtMs: z.number().int().nonnegative().nullable(),
  interrupted: z.boolean(),
}).strict().refine((value) => (value.choice == null) === (value.rtMs == null), {
  message: 'choice and rtMs must both be present or both be null',
})

export type ReversallearningTrial = z.infer<typeof reversallearningTrialSchema>
