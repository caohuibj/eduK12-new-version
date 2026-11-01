import { z } from 'zod'
import { proofreadConfigSchema } from './proofread.config'
import { reportMetaSchema } from './report-meta'

/** The audited identity admits only the matching finite bank and descriptive report. */
export const proofreadAuditedConfigSchema = proofreadConfigSchema.extend({
  totalTrials: z.number().int().min(1).max(36),
  stimulusSetVersion: z.literal('proofread-zh-v1.1.0'),
  report: reportMetaSchema.extend({ reportVersion: z.enum(['1.1.0', '3.0.0']), referenceMode: z.literal('none') }),
}).refine(config => config.validRtFloorMs < config.timeoutMs, { message: 'validRtFloorMs must be below timeoutMs', path: ['validRtFloorMs'] })
