import { z } from 'zod'

const centralTargetSchema = z.enum(['circle', 'triangle'])

/** Ufov 单试次 observable facts；中心/周边目标由服务端按 seed+trialIndex 重建。 */
export const ufovTrialSchema = z
  .object({
    centralTarget: centralTargetSchema,
    peripheralPosition: z.number().int().min(0).max(7),
    centralResponse: z.number().int().min(0).max(1).nullable(),
    peripheralResponse: z.number().int().min(0).max(7).nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.centralResponse === null) === (value.peripheralResponse === null), {
    message: 'centralResponse and peripheralResponse must be null together for a timeout',
    path: ['centralResponse'],
  })

export type UfovTrial = z.infer<typeof ufovTrialSchema>
export type UfovCentralTarget = z.infer<typeof centralTargetSchema>
