import { z } from 'zod'

const moveSchema = z.object({
  disk: z.number().int().min(0).max(2),
  from: z.number().int().min(0).max(2),
  to: z.number().int().min(0).max(2),
  atMs: z.number().int().nonnegative(),
}).strict()

export const towerTrialSchema = z.object({
  problemId: z.string().regex(/^tower-\d{2}$/),
  moves: z.array(moveSchema).max(40),
  gaveUp: z.boolean(),
  interrupted: z.boolean(),
  timedOut: z.boolean().optional(),
}).strict()

export type TowerTrial = z.infer<typeof towerTrialSchema>
