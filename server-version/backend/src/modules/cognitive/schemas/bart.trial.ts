import { z } from 'zod'

export const bartTrialSchema = z.object({
  pumpCount: z.number().int().min(0).max(30),
  completed: z.boolean(),
  cashedOut: z.boolean(),
  interrupted: z.boolean(),
}).strict().refine((value) => value.completed || !value.cashedOut, {
  message: 'an incomplete balloon cannot be cashed out',
  path: ['cashedOut'],
})

export type BartTrial = z.infer<typeof bartTrialSchema>
