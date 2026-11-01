import { z } from 'zod'

/** Pursuitrotor 单试次 observable facts；追踪路径由服务端按冻结参数推导，时间比为服务端换算。 */
export const pursuitrotorTrialSchema = z
  .object({
    trialIndex: z.number().int().min(0),
    timeOnTargetMs: z.number().int().min(0),
    totalTrackMs: z.number().int().min(0),
    interrupted: z.boolean(),
  })
  .strict()
  .refine((value) => value.timeOnTargetMs <= value.totalTrackMs, {
    message: 'timeOnTargetMs must not exceed totalTrackMs',
    path: ['timeOnTargetMs'],
  })

export type PursuitrotorTrial = z.infer<typeof pursuitrotorTrialSchema>
