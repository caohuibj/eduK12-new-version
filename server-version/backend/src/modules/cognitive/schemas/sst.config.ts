import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const sstConfigSchema = z
  .object({
    totalTrials: z.number().int().min(24).max(320),
    stopRatio: z.literal(0.25),
    ssdStartMs: z.number().int().positive(),
    ssdMinMs: z.number().int().positive(),
    ssdMaxMs: z.number().int().positive(),
    ssdStepMs: z.number().int().positive(),
    goTimeoutMs: z.number().int().positive(),
    isiMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => value.ssdMinMs <= value.ssdStartMs && value.ssdStartMs <= value.ssdMaxMs, {
    message: 'ssdStartMs must lie between ssdMinMs and ssdMaxMs',
    path: ['ssdStartMs'],
  })
  .refine((value) => value.ssdMinMs < value.ssdMaxMs, {
    message: 'ssdMinMs must be less than ssdMaxMs',
    path: ['ssdMaxMs'],
  })

export type SstConfig = z.infer<typeof sstConfigSchema>
