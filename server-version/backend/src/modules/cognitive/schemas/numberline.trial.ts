import { z } from 'zod'

/**
 * Numberline 单试次 observable facts；误差/正确性/超时都由服务端推导。
 * responsePosition 为 0..1 的线段比例，服务端换算为线上的数值估计。
 */
export const numberlineTrialSchema = z
  .object({
    targetNumber: z.number().int().min(0),
    responsePosition: z.number().min(0).max(1).nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.responsePosition === null) === (value.rtMs === null), {
    message: 'responsePosition and rtMs must be null together for a timeout',
    path: ['responsePosition'],
  })

export type NumberlineTrial = z.infer<typeof numberlineTrialSchema>
