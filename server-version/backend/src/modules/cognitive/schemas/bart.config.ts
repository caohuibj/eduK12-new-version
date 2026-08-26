import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const bartConfigSchema = z.object({
  balloonCount: z.number().int().min(10).max(50),
  maxPumps: z.number().int().min(4).max(30),
  trialTimeoutMs: z.number().int().min(3000).max(30000),
  pumpAnimationMs: z.number().int().min(50).max(1000),
  stimulusSetVersion: z.literal('bart-generated-v1.0.0'),
  report: reportMetaSchema,
}).strict()

export type BartConfig = z.infer<typeof bartConfigSchema>
