import { z } from 'zod'

/** Embeddedfigures 单试次 observable facts；目标 id 由服务端按 seed+index 重建并推导正确性。 */
export const embeddedfiguresTrialSchema = z
  .object({
    itemIndex: z.number().int().min(0),
    clickedShapeId: z.string().nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.clickedShapeId === null) === (value.rtMs === null), {
    message: 'clickedShapeId and rtMs must be null together for a timeout',
    path: ['clickedShapeId'],
  })

export type EmbeddedfiguresTrial = z.infer<typeof embeddedfiguresTrialSchema>
