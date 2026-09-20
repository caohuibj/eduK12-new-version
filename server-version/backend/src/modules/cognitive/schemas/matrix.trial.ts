import { z } from 'zod'

export const matrixTrialSchema = z.object({
  itemId: z.string().regex(/^matrix-\d{2}$/),
  selectedOption: z.number().int().min(0).max(3).nullable(),
  rtMs: z.number().int().nonnegative().nullable(),
  interrupted: z.boolean(),
  timedOut: z.boolean().optional(),
}).strict()

export type MatrixTrial = z.infer<typeof matrixTrialSchema>
