import { z } from 'zod'

/** Visualwm 单试次 observable facts；颜色/位置/是否变化由服务端按 seed+index 重建。 */
export const visualwmTrialSchema = z
  .object({
    setSize: z.number().int().min(1).max(6),
    isChange: z.boolean(),
    response: z.enum(['same', 'change']).nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()

export type VisualwmTrial = z.infer<typeof visualwmTrialSchema>
