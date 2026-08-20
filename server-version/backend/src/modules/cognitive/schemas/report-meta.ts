import { z } from 'zod'

/**
 * Provisional Reference Metadata（Milestone E §6 / §13）。
 *
 * 随 config snapshot 冻结，不进入数据库额外列（§14）。
 * referenceMode：
 *  - none     不显示群体参考位置
 *  - simulated 开发/QA/内部 pilot 模拟参考（必须带 disclaimer，禁止称 percentile）
 *  - literature 仅当 protocol 足够匹配时启用（显示“研究参考”，非 eduK12 常模）
 *
 * `referenceVersion` / `referenceBand` 在 GET 时由 resolveCognitiveReference 消费（Session 5）。
 */
export const reportMetaSchema = z
  .object({
    reportVersion: z.string(),
    referenceMode: z.enum(['none', 'simulated', 'literature']),
    referenceVersion: z.string().optional(),
    referenceBand: z.string().optional(),
  })
  .strict()

export type ReportMeta = z.infer<typeof reportMetaSchema>
