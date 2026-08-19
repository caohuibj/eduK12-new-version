import { z } from 'zod'

/**
 * Fake Test v1 Config Schema（D2 Step 2）。
 *
 * 必须与 D1 seed 中的 fake `1.0.0` 配置一致：
 *   { "trialCount": 3, "trialDurationMs": 1000, "allowPractice": false, "maxRtMs": 60000 }
 *
 * `.strict()`：未声明字段直接失败，避免同一 configVersion 悄悄改变契约。
 */
export const fakeConfigSchema = z
  .object({
    trialCount: z.number().int().positive(),
    trialDurationMs: z.number().int().positive(),
    allowPractice: z.boolean(),
    maxRtMs: z.number().int().positive(),
  })
  .strict()

export type FakeConfig = z.infer<typeof fakeConfigSchema>
