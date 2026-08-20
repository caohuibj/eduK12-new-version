import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/**
 * Reaction Test v1 Config Schema（Milestone E Session 2 / §28）。
 *
 * 商业候选参数（§95 冻结表）：
 *   totalTrials = 20（文献 30，商业短式 C 类，需 pilot）
 *   foreperiod  = 700–1500 ms（文献 A）
 *   timeout     = 2000 ms（文献 A）
 *   readyDurationMs = 1000 ms
 *
 * RT valid floor is a scoring-version constant, not a config field.
 *
 * 采用与 Fake 一致的 `z.number().int().positive()`（非 .literal），以便测试/CI 使用较小
 * trial 数的 config（如 F4 的 5-trial flag 验证）。冻结值由 seed + 文档参数冻结表保证。
 *
 * `.strict()`：未声明字段直接失败，避免同一 configVersion 悄悄改变契约。
 */
export const reactionConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    foreperiodMinMs: z.number().int().positive(),
    foreperiodMaxMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    readyDurationMs: z.number().int().positive(),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => value.foreperiodMaxMs >= value.foreperiodMinMs, {
    message: 'foreperiodMaxMs must be greater than or equal to foreperiodMinMs',
    path: ['foreperiodMaxMs'],
  })

export type ReactionConfig = z.infer<typeof reactionConfigSchema>
