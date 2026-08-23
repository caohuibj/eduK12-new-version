import { z } from 'zod'

export const digitbackwardTrialSchema = z.object({
  spanLength: z.number().int().min(2).max(9),
  trialWithinLevel: z.union([z.literal(1), z.literal(2)]),
  sequence: z.array(z.number().int().min(0).max(9)).min(2).max(9),
  response: z.array(z.number().int().min(0).max(9)).max(9),
  responseDurationMs: z.number().int().nonnegative(),
  interrupted: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.sequence.length !== value.spanLength) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sequence length must equal spanLength', path: ['sequence'] })
  }
})

export type DigitbackwardTrial = z.infer<typeof digitbackwardTrialSchema>
