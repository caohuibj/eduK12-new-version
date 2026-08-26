import { z } from 'zod'

const blockIdSchema = z.number().int().min(0).max(8)

export const corsiTrialSchema = z
  .object({
    spanLength: z.number().int().min(2).max(9),
    trialWithinLevel: z.union([z.literal(1), z.literal(2)]),
    sequence: z.array(blockIdSchema).min(2).max(9),
    response: z.array(blockIdSchema).min(0).max(9),
    responseDurationMs: z.number().finite().nonnegative(),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => value.sequence.length === value.spanLength, {
    message: 'sequence length must equal spanLength',
    path: ['sequence'],
  })
  .refine((value) => new Set(value.sequence).size === value.sequence.length, {
    message: 'sequence block ids must be unique',
    path: ['sequence'],
  })

export type CorsiTrial = z.infer<typeof corsiTrialSchema>
