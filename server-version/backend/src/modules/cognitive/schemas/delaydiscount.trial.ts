import { z } from 'zod'

/**
 * Delaydiscount 单试次 observable facts；无差异点轨迹由服务端按二分规则复核。
 * immediateAmount 必须等于当前上下界的四舍五入中点，否则评分拒绝。
 */
export const delaydiscountTrialSchema = z
  .object({
    delayDays: z.number().int().positive(),
    delayedAmount: z.number().int().positive(),
    immediateAmount: z.number().int().nonnegative(),
    choice: z.enum(['now', 'later']).nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.choice === null) === (value.rtMs === null), {
    message: 'choice and rtMs must be null together for a timeout',
    path: ['choice'],
  })

export type DelaydiscountTrial = z.infer<typeof delaydiscountTrialSchema>
