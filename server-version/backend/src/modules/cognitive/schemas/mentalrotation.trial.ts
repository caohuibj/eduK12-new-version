import { z } from 'zod'

export const mentalrotationTrialSchema = z.object({
  itemId: z.string().regex(/^rotation-\d{3}$/),
  response: z.enum(['same', 'mirror']).nullable(),
  rtMs: z.number().int().nonnegative().nullable(),
  interrupted: z.boolean(),
  timedOut: z.boolean().optional(),
}).strict()

export type MentalrotationTrial = z.infer<typeof mentalrotationTrialSchema>
