import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Pursuitrotor v1 配置：追踪旋转（感觉运动；Pursuit Rotor 经典范式）。 */
export const pursuitrotorConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    trackMs: z.number().int().positive(),
    revolutionMs: z.number().int().positive(),
    report: reportMetaSchema,
  })
  .strict()

export type PursuitrotorConfig = z.infer<typeof pursuitrotorConfigSchema>
