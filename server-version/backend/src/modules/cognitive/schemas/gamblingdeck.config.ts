import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Gamblingdeck v1 配置：四箱概率奖惩决策学习；奖惩计划钉在 scoringVersion，不进 config。 */
export const gamblingdeckConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    blockSize: z.number().int().positive(),
    fixationMs: z.number().int().positive(),
    feedbackMs: z.number().int().positive(),
    report: reportMetaSchema,
  })
  .strict()

export type GamblingdeckConfig = z.infer<typeof gamblingdeckConfigSchema>
