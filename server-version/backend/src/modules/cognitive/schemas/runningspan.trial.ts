import { z } from 'zod'

/**
 * Runningspan 单试次 observable facts；串行正确性由服务端推导。
 * sequence 为本试次呈现的字母序列，response 为按顺序回忆的最后 k 项（可缺项）。
 */
export const runningspanTrialSchema = z
  .object({
    sequence: z.array(z.string().length(1)).min(1),
    response: z.array(z.string().length(1)),
    responseDurationMs: z.number().min(0).transform((value) => Math.round(value)),
    interrupted: z.boolean(),
  })
  .strict()

export type RunningspanTrial = z.infer<typeof runningspanTrialSchema>
