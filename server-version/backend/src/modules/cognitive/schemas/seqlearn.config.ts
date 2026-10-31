import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

/** Seqlearn v1 配置：序列反应时（SRT）；重复序列与随机块位置随 config 冻结。 */
export const seqlearnConfigSchema = z
  .object({
    totalTrials: z.number().int().positive(),
    trialsPerBlock: z.number().int().positive(),
    patternSequence: z.array(z.number().int().min(1).max(4)).min(1),
    randomBlockIndices: z.array(z.number().int().positive()).min(1),
    fixationMs: z.number().int().positive(),
    stimulusMs: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    validRtFloorMs: z.number().int().nonnegative(),
    report: reportMetaSchema,
  })
  .strict()
  .refine((value) => value.totalTrials % value.trialsPerBlock === 0, {
    message: 'totalTrials must be a multiple of trialsPerBlock',
    path: ['totalTrials'],
  })
  .refine((value) => {
    const blockCount = value.totalTrials / value.trialsPerBlock
    return value.randomBlockIndices.every((index) => index <= blockCount) && value.randomBlockIndices.length < blockCount
  }, {
    message: 'randomBlockIndices must reference existing blocks and keep at least one pattern block',
    path: ['randomBlockIndices'],
  })

export type SeqlearnConfig = z.infer<typeof seqlearnConfigSchema>
