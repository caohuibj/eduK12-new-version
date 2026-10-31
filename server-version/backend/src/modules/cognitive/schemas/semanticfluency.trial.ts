import { z } from 'zod'

/**
 * Semanticfluency 单试次 observable facts；词库匹配与去重由服务端推导。
 * responses 为参与者在限时内自由输入的原始词列表（顺序保留）。
 */
export const semanticfluencyTrialSchema = z
  .object({
    category: z.enum(['animals', 'fruits']),
    responses: z.array(z.string().max(30)),
    responseDurationMs: z.number().min(0).transform((value) => Math.round(value)),
    interrupted: z.boolean(),
  })
  .strict()

export type SemanticfluencyTrial = z.infer<typeof semanticfluencyTrialSchema>
