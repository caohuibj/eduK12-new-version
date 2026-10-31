import { z } from 'zod'
import { readingcompConfigSchema } from './readingcomp.config'
import { reportMetaSchema } from './report-meta'

/** The audited identity admits only the matching finite bank and descriptive report. */
export const readingcompAuditedConfigSchema = readingcompConfigSchema.extend({
  totalTrials: z.number().int().min(1).max(36),
  stimulusSetVersion: z.literal('readingcomp-zh-v1.1.0'),
  report: reportMetaSchema.extend({ reportVersion: z.literal('1.1.0'), referenceMode: z.literal('none') }),
}).refine(config => config.validRtFloorMs < config.timeoutMs, { message: 'validRtFloorMs must be below timeoutMs', path: ['validRtFloorMs'] })
