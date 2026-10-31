import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Icarmatrix v2 配置：matRiks 规则题库轨（Roadmap v2.0 PR3）。
 * matrixType 承载人群难度：2x2=儿童、3x3=青少年/成人；profile 仅调 totalTrials。 */
export const icarmatrixV2ConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    matrixType: z.enum(['2x2', '3x3']),
    stimulusSetVersion: z.literal('matgen-bank-v1.0.0'),
    fixationMs: z.number().int().min(0),
    timeoutMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().min(0),
    report: reportMetaSchema,
  })
  .strict()

export type IcarmatrixV2Config = z.infer<typeof icarmatrixV2ConfigSchema>
