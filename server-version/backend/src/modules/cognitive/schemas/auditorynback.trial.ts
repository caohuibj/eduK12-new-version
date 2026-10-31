import { z } from 'zod'

/** Auditorynback 单试次 observable facts；音序列由服务端按种子推导，命中/误报与 d′ 由服务端换算。 */
export const auditorynbackTrialSchema = z
  .object({
    trialIndex: z.number().int().min(0),
    /** 客户端回显的音序索引（审计用；与服务端序列不一致触发质量旗标）。 */
    toneIndex: z.number().int().min(0),
    responded: z.boolean(),
    /** rtMs = 音符起点到按键；未按键记 null。 */
    rtMs: z.number().int().min(0).nullable(),
    interrupted: z.boolean(),
    /** Web Audio 环境延迟留痕；环境未上报时为 null。 */
    audioLatencyMs: z.number().int().min(0).nullable(),
  })
  .strict()

export type AuditorynbackTrial = z.infer<typeof auditorynbackTrialSchema>
