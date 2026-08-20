import { z } from 'zod'

const digitSequenceSchema = z.array(z.number().int().min(0).max(9)).min(1).max(32)

/**
 * Memory 单试次只接收可观察的刺激与作答事实；correct/score 由 scorer 推导。
 */
export const memoryTrialSchema = z
  .object({
    length: z.number().int().positive(),
    trialWithinLevel: z.union([z.literal(1), z.literal(2)]),
    sequence: digitSequenceSchema,
    response: digitSequenceSchema,
    responseDurationMs: z.number().finite().nonnegative(),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => value.sequence.length === value.length, {
    message: 'sequence length must equal length',
    path: ['sequence'],
  })
  .refine((value) => value.response.length === value.length, {
    message: 'response length must equal length',
    path: ['response'],
  })

export type MemoryTrial = z.infer<typeof memoryTrialSchema>
