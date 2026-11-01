import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Maze v1 配置：迷宫学习（递归回溯生成 + 路径效率）。 */
export const mazeConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    mazeCols: z.number().int().min(5).max(15),
    mazeRows: z.number().int().min(5).max(15),
    timeLimitMs: z.number().int().positive(),
    report: reportMetaSchema,
  })
  .strict()

export type MazeConfig = z.infer<typeof mazeConfigSchema>
