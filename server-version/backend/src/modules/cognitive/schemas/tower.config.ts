import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const towerConfigSchema = z.object({
  problemCount: z.union([z.literal(4), z.literal(10), z.literal(18)]),
  maxMovesFactor: z.number().min(1.5).max(5),
  inactivityGuardMs: z.number().int().positive(),
  stimulusSetVersion: z.literal('three-peg-tower-v1.0.0'),
  report: reportMetaSchema,
}).strict()

export type TowerConfig = z.infer<typeof towerConfigSchema>
