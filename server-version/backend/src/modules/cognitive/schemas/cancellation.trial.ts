import { z } from 'zod'

/**
 * Cancellation 单试次 observable facts；目标/干扰由服务端按 seed+scan 重建。
 * selectedCells 为结束时刻保持选中的格子索引集合（客户端记录，服务端与目标集求交并）。
 */
export const cancellationTrialSchema = z
  .object({
    scanIndex: z.number().int().min(0),
    selectedCells: z.array(z.number().int().min(0)),
    responseDurationMs: z.number().min(0).transform((value) => Math.round(value)),
    interrupted: z.boolean(),
  })
  .strict()

export type CancellationTrial = z.infer<typeof cancellationTrialSchema>
