import { z } from 'zod'

/**
 * Reaction Test v1 Trial Schema（Milestone E Session 2 / §32）。
 *
 * 只提交实际发生的 observable facts；服务器推导 correct / miss / valid（§19）。
 *
 * 示例 payload：
 *   { "foreperiodMs": 1180, "rtMs": 312, "prematureCount": 0, "interrupted": false, "inputMode": "pointer" }
 *
 * 说明：
 *  - `trialIndex` 是数据库/API envelope 字段，不重复塞进 payload。
 *  - `rtMs = null` 表示 miss / timeout（未在 timeoutMs 内响应）。
 *  - `prematureCount` 仅在 green 前响应时累加；该情况前端不调用 appendTrial（不推进 trialIndex）。
 *  - `inputMode` 仅记录 pointer/touch/keyboard（§23，Lean，不收集 device fingerprint）。
 *  - 不提交 valid / score / payloadHash / 加密内容。
 */
export const reactionTrialSchema = z
  .object({
    foreperiodMs: z.number().int().min(0),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    prematureCount: z.number().int().min(0),
    interrupted: z.boolean(),
    inputMode: z.enum(['pointer', 'touch', 'keyboard']),
  })
  .strict()

export type ReactionTrial = z.infer<typeof reactionTrialSchema>
