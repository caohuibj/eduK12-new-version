import { z } from 'zod'

const sideSchema = z.enum(['left', 'right'])
const fontScaleSchema = z.enum(['large', 'small'])

/**
 * Sizecongruity 单试次 observable facts；数值较大侧、条件与正确性都由服务端推导。
 */
export const sizecongruityTrialSchema = z
  .object({
    leftDigit: z.number().int().min(0),
    rightDigit: z.number().int().min(0),
    leftFontScale: fontScaleSchema,
    rightFontScale: fontScaleSchema,
    response: sideSchema.nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.response === null) === (value.rtMs === null), {
    message: 'response and rtMs must be null together for a timeout',
    path: ['response'],
  })
  .refine((value) => value.leftDigit !== value.rightDigit && value.leftFontScale !== value.rightFontScale, {
    message: 'digits and font scales must differ within a trial',
    path: ['leftDigit'],
  })

export type SizecongruityTrial = z.infer<typeof sizecongruityTrialSchema>
export type SizecongruitySide = z.infer<typeof sideSchema>
