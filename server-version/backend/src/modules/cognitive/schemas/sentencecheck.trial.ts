import { z } from 'zod'

const shapeSchema = z.enum(['circle', 'square', 'triangle'])
const colorSchema = z.enum(['red', 'blue', 'green', 'yellow'])
const questionKindSchema = z.enum(['shape', 'color'])
const shapeValueSchema = z.enum(['圆形', '方形', '三角形'])
const colorValueSchema = z.enum(['红色', '蓝色', '绿色', '黄色'])

/**
 * Sentencecheck 单试次 observable facts；陈述真伪由服务端推导。
 * askedValue 是句子中声称的属性值（可能与实际不一致）。
 */
export const sentencecheckTrialSchema = z
  .object({
    shape: shapeSchema,
    color: colorSchema,
    questionKind: questionKindSchema,
    negated: z.boolean(),
    askedValue: z.union([shapeValueSchema, colorValueSchema]),
    response: z.boolean().nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.response === null) === (value.rtMs === null), {
    message: 'response and rtMs must be null together for a timeout',
    path: ['response'],
  })
  .refine((value) => (
    value.questionKind === 'shape'
      ? ['圆形', '方形', '三角形'].includes(value.askedValue)
      : ['红色', '蓝色', '绿色', '黄色'].includes(value.askedValue)
  ), {
    message: 'askedValue must match the question kind',
    path: ['askedValue'],
  })

export type SentencecheckTrial = z.infer<typeof sentencecheckTrialSchema>
