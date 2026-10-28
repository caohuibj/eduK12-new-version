import { z } from 'zod'

/** Icarmatrix 单试次 observable facts；题目内容由服务端按 seed+index 重建并推导正确性。 */
export const icarmatrixTrialSchema = z
  .object({
    itemIndex: z.number().int().min(0),
    responseIndex: z.number().int().min(0).max(5).nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.responseIndex === null) === (value.rtMs === null), {
    message: 'responseIndex and rtMs must be null together for a timeout',
    path: ['responseIndex'],
  })

export type IcarmatrixTrial = z.infer<typeof icarmatrixTrialSchema>
