import { z } from 'zod'

/** Icarmatrix v2 单试次 observable facts；正确性由服务端按题库 + 同源呈现排序推导。
 * responseIndex 是呈现序（前端/服务端共享 icarmatrixV2OptionOrder 还原 bank 序）。 */
export const icarmatrixV2TrialSchema = z
  .object({
    trialIndex: z.number().int().min(0),
    bankItemId: z.string().min(1),
    responseIndex: z.number().int().min(0).max(5).nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.responseIndex === null) === (value.rtMs === null), {
    message: 'responseIndex and rtMs must be null together for a timeout',
    path: ['responseIndex'],
  })

export type IcarmatrixV2Trial = z.infer<typeof icarmatrixV2TrialSchema>
