import { z } from 'zod'

/** Gamblingdeck 单试次 observable facts：箱选择是唯一的客户端行为事实；净结果由服务端计划推导。 */
export const gamblingdeckTrialSchema = z
  .object({
    deck: z.enum(['A', 'B', 'C', 'D']),
    rtMs: z.number().min(0).nullable().transform((value) => (value == null ? null : Math.round(value))),
    interrupted: z.boolean(),
  })
  .strict()

export type GamblingdeckTrial = z.infer<typeof gamblingdeckTrialSchema>
export type GamblingdeckDeck = z.infer<typeof gamblingdeckTrialSchema>['deck']
