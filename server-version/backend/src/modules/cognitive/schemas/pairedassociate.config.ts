import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const pairedassociateConfigSchema = z.object({
  pairCount: z.union([z.literal(6), z.literal(12), z.literal(18)]),
  learningRounds: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  delayedEnabled: z.boolean(),
  delayedDelayMs: z.number().int().nonnegative(),
  studyDurationMs: z.number().int().positive(),
  inactivityGuardMs: z.number().int().positive(),
  stimulusSetVersion: z.string().regex(/^nonverbal-pairs-v\d+\.\d+\.\d+$/),
  report: reportMetaSchema,
}).strict()

export type PairedassociateConfig = z.infer<typeof pairedassociateConfigSchema>
