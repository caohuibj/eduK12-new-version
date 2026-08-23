import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const picturesequenceConfigSchema = z.object({
  itemCount: z.union([z.literal(6), z.literal(12), z.literal(15)]),
  learningRounds: z.union([z.literal(2), z.literal(3)]),
  delayedEnabled: z.boolean(),
  delayedDelayMs: z.number().int().nonnegative(),
  studyMsPerItem: z.number().int().positive(),
  inactivityGuardMs: z.number().int().positive(),
  stimulusSetVersion: z.string().regex(/^daily-scenes-v\d+\.\d+\.\d+$/),
  report: reportMetaSchema,
}).strict()

export type PicturesequenceConfig = z.infer<typeof picturesequenceConfigSchema>
