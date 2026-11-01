import { z } from 'zod'

/** Lineangle 单试次 observable facts；目标与选项由服务端校验，正确性由服务端推导。 */
export const lineangleTrialSchema = z
  .object({
    targetAngle: z.number().min(0).max(180),
    optionAngles: z.array(z.number().min(0).max(180)).min(2),
    responseAngle: z.number().min(0).max(180).nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.responseAngle === null) === (value.rtMs === null), {
    message: 'responseAngle and rtMs must be null together for a timeout',
    path: ['responseAngle'],
  })

export type LineangleTrial = z.infer<typeof lineangleTrialSchema>
