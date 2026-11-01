import { z } from 'zod'

/**
 * Arithverify 单试次 observable facts；等式真伪与正确性都由服务端推导。
 * displayedResult 是屏幕上呈现的（可能被改动的）结果。
 */
export const arithverifyTrialSchema = z
  .object({
    leftOperand: z.number().int().min(0),
    rightOperand: z.number().int().min(0),
    displayedResult: z.number().int().min(0),
    response: z.boolean().nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.response === null) === (value.rtMs === null), {
    message: 'response and rtMs must be null together for a timeout',
    path: ['response'],
  })

export type ArithverifyTrial = z.infer<typeof arithverifyTrialSchema>
