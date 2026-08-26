import { z } from 'zod'

const patternStimulusSchema = z.object({
  shape: z.enum(['circle', 'square', 'triangle']),
  fill: z.enum(['solid', 'outline']),
  marks: z.number().int().min(1).max(3),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
}).strict()

export const patterncompareTrialSchema = z
  .object({
    leftPattern: patternStimulusSchema,
    rightPattern: patternStimulusSchema,
    response: z.enum(['same', 'different']).nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => (value.response == null) === (value.rtMs == null), {
    message: 'response and rtMs must both be present or both be null',
  })

export type PatterncompareTrial = z.infer<typeof patterncompareTrialSchema>
