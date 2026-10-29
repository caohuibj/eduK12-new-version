import { z } from 'zod'

/** Maze 单试次 observable facts；迷宫结构由服务端按 seed+index 重建，路径合法性由服务端验证。 */
export const mazeTrialSchema = z
  .object({
    mazeIndex: z.number().int().min(0),
    moves: z.array(z.number().int().min(0).max(3)), // 0=up, 1=right, 2=down, 3=left
    completionTimeMs: z.number().int().min(0).nullable(),
    completed: z.boolean(),
    interrupted: z.boolean(),
  })
  .strict()

export type MazeTrial = z.infer<typeof mazeTrialSchema>
