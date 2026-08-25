import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const reversallearningConfigSchema = z
  .object({
    totalTrials: z.number().int().min(40).max(240),
    acquisitionTrials: z.number().int().min(20).max(120),
    reversalTrials: z.number().int().min(20).max(120),
    criterionConsecutiveCorrect: z.number().int().min(4).max(10),
    rewardProbability: z.number().min(0.6).max(0.95),
    trialTimeoutMs: z.number().int().min(1000).max(10000),
    stimulusSetVersion: z.literal('reversal-symbols-v1.0.0'),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => value.acquisitionTrials + value.reversalTrials === value.totalTrials, {
    path: ['totalTrials'],
    message: 'acquisitionTrials plus reversalTrials must equal totalTrials',
  })

export type ReversallearningConfig = z.infer<typeof reversallearningConfigSchema>
