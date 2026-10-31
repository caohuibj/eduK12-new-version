import { z } from 'zod'

/**
 * Letternumseries 单试次 observable facts；字母序/数字序的正确性由服务端推导。
 * sequence 为呈现序列（字母与数字混合），lettersResponse/digitsResponse 为两段回忆输入。
 */
export const letternumseriesTrialSchema = z
  .object({
    sequence: z.array(z.string().length(1)).min(2),
    lettersResponse: z.array(z.string().length(1)),
    digitsResponse: z.array(z.string().length(1)),
    responseDurationMs: z.number().min(0).transform((value) => Math.round(value)),
    interrupted: z.boolean(),
  })
  .strict()

export type LetternumseriesTrial = z.infer<typeof letternumseriesTrialSchema>
