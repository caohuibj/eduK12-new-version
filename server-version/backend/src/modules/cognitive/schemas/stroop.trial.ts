import { z } from 'zod'

const colorSchema = z.enum(['red', 'green', 'blue', 'yellow'])
const wordSchema = z.enum(['红', '绿', '蓝', '黄'])

/**
 * Stroop 单试次 observable facts；condition/correct/timeout 都由服务端推导。
 */
export const stroopTrialSchema = z
  .object({
    word: wordSchema,
    inkColor: colorSchema,
    response: colorSchema.nullable(),
    rtMs: z.number().int().min(0).nullable(),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.response === null) === (value.rtMs === null), {
    message: 'response and rtMs must be null together for a timeout',
    path: ['response'],
  })

export type StroopTrial = z.infer<typeof stroopTrialSchema>
