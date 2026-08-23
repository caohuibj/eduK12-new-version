import { z } from 'zod'

export const taskswitchTrialSchema = z
  .object({
    blockIndex: z.number().int().min(0),
    taskRule: z.enum(['parity', 'magnitude']),
    previousTaskRule: z.enum(['parity', 'magnitude']).nullable(),
    switchType: z.enum(['start', 'switch', 'repeat']),
    stimulus: z.number().int().min(1).max(9),
    response: z.enum(['left', 'right']).nullable(),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => value.stimulus !== 5, {
    message: 'stimulus 5 is excluded from parity/magnitude mapping',
    path: ['stimulus'],
  })
  .refine((value) => (value.response == null) === (value.rtMs == null), {
    message: 'response and rtMs must both be present or both be null',
  })
  .refine((value) => {
    if (value.switchType === 'start') return value.previousTaskRule == null
    return value.previousTaskRule != null
  }, {
    message: 'start trials have no previous task; others must',
  })

export type TaskswitchTrial = z.infer<typeof taskswitchTrialSchema>
