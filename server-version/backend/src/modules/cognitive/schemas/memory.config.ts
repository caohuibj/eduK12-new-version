import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Digit Span Forward 的冻结配置。每个长度固定完成两题后才决定是否升级。 */
export const memoryConfigSchema = z
  .object({
    startLength: z.literal(2),
    maxLength: z.number().int().min(2).max(11),
    trialsPerLevel: z.literal(2),
    digitDisplayMs: z.number().int().positive(),
    digitIntervalMs: z.number().int().positive(),
    readyDurationMs: z.number().int().positive(),
    inactivityGuardMs: z.number().int().positive(),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => value.maxLength >= value.startLength, {
    message: 'maxLength must be greater than or equal to startLength',
    path: ['maxLength'],
  })

export type MemoryConfig = z.infer<typeof memoryConfigSchema>
