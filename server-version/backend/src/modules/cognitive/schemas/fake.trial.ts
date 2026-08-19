import { z } from 'zod'

/**
 * Fake Test v1 Trial Schema（D2 Step 3）。
 *
 * 示例 payload：{ "correct": true, "rtMs": 420 }
 *
 * 说明：
 *  - `trialIndex` 是数据库/API envelope 字段，不重复塞进 payload。
 *  - `maxRtMs` 是 config-dependent 规则，由 scorer/completion 阶段处理，不在此校验。
 *  - 不增加 stimulus、keyboard、device、browser metadata 等字段（D2 §7）。
 */
export const fakeTrialSchema = z
  .object({
    correct: z.boolean(),
    rtMs: z.number().int().min(0),
  })
  .strict()

export type FakeTrial = z.infer<typeof fakeTrialSchema>
