import { z } from 'zod'

/** Timecopy 单试次 observable facts；误差与偏差由服务端推导。responseMs 由复制时长上限封顶。 */
export const timecopyTrialSchema = z
  .object({
    targetMs: z.number().int().min(500),
    responseMs: z.number().int().min(0),
    interrupted: z.boolean(),
  })
  .strict()

export type TimecopyTrial = z.infer<typeof timecopyTrialSchema>
