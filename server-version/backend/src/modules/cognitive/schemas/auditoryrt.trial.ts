import { z } from 'zod'

/** Auditoryrt 单试次 observable facts；前瞻期调度由服务端按种子推导，RT 有效性与指标由服务端换算。 */
export const auditoryrtTrialSchema = z
  .object({
    trialIndex: z.number().int().min(0),
    /** 客户端回显的调度前瞻期（审计用，不参与计分）。 */
    foreperiodMs: z.number().int().min(0),
    /** rtMs = 声音起点到按键；提前按键记 0；窗口内无按键记 null。 */
    rtMs: z.number().int().min(0).nullable(),
    interrupted: z.boolean(),
    /** Web Audio 环境延迟留痕；环境未上报时为 null。 */
    audioLatencyMs: z.number().int().min(0).nullable(),
  })
  .strict()

export type AuditoryrtTrial = z.infer<typeof auditoryrtTrialSchema>
