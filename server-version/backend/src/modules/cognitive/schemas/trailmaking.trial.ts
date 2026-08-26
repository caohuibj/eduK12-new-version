import { z } from 'zod'

const pointerTypeSchema = z.enum(['mouse', 'touch', 'pen', 'keyboard', 'unknown'])

export const trailmakingTrialSchema = z.object({
  attempts: z.array(z.object({
    targetId: z.string().regex(/^[AB]-\d{2}$/),
    atMs: z.number().int().nonnegative().max(600000),
    pointerType: pointerTypeSchema,
  }).strict()).max(64),
  deviceClass: z.enum(['desktop', 'tablet', 'phone', 'unknown']),
  interrupted: z.boolean(),
}).strict().superRefine((value, context) => {
  for (let index = 1; index < value.attempts.length; index += 1) {
    if (value.attempts[index].atMs < value.attempts[index - 1].atMs) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['attempts', index, 'atMs'], message: 'attempt times must be non-decreasing' })
    }
  }
})

export type TrailmakingTrial = z.infer<typeof trailmakingTrialSchema>
