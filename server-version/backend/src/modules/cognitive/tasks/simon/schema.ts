import { z } from 'zod'
export const SIMON_CONFIG = { totalTrials: 100, practiceTrials: 20, responseWindowMs: 2000, feedbackMs: 1000, isiMinMs: 500, isiMaxMs: 999, report: { reportVersion: '1.0.0', referenceMode: 'none' } } as const
export const simonConfigSchema = z.object({ totalTrials: z.literal(100), practiceTrials: z.literal(20), responseWindowMs: z.literal(2000), feedbackMs: z.literal(1000), isiMinMs: z.literal(500), isiMaxMs: z.literal(999), report: z.object({ reportVersion: z.literal('1.0.0'), referenceMode: z.literal('none') }).strict() }).strict()
export type SimonConfig = z.infer<typeof simonConfigSchema>
export const simonTrialSchema = z.object({
  color: z.enum(['red', 'blue']), stimulusSide: z.enum(['left', 'right']), requiredSide: z.enum(['left', 'right']), mapping: z.enum(['red-left', 'blue-left']),
  timing: z.object({ strategy: z.literal('double-raf-performance-v1'), onsetPerfMs: z.number().finite().nonnegative().nullable(), windowEndPerfMs: z.number().finite().nonnegative(), isiMs: z.number().int().min(500).max(999) }).strict(),
  responseSide: z.enum(['left', 'right']).nullable(), rtMs: z.number().finite().min(0).lt(2000).nullable(), timeout: z.boolean(), interrupted: z.boolean(),
}).strict().superRefine((t, ctx) => {
  if ((t.responseSide === null) !== (t.rtMs === null) || t.timeout !== (t.responseSide === null)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Response, RT and timeout must agree' })
})
export type SimonTrial = z.infer<typeof simonTrialSchema>
