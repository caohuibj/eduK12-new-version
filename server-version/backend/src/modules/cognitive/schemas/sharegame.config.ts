import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Sharegame v1 配置：多轮独裁者式分享决策；每轮禀赋随 config 冻结。 */
export const sharegameConfigSchema = z
  .object({
    endowments: z.array(z.number().int().positive()).min(1).max(8),
    fixationMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    report: reportMetaSchema,
  })
  .strict()

export type SharegameConfig = z.infer<typeof sharegameConfigSchema>
