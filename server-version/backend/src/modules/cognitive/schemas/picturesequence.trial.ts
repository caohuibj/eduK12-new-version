import { z } from 'zod'

export const picturesequenceTrialSchema = z.object({
  phase: z.enum(['learning', 'delayed']),
  roundIndex: z.number().int().nonnegative(),
  itemIds: z.array(z.string().regex(/^scene-\d{2}$/)).min(6).max(15),
  responseOrder: z.array(z.string().regex(/^scene-\d{2}$/)).max(15),
  responseDurationMs: z.number().int().nonnegative(),
  interrupted: z.boolean(),
}).strict()

export type PicturesequenceTrial = z.infer<typeof picturesequenceTrialSchema>
