import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const LEXICALDECISION_STIMULUS_SET_VERSION = 'zh-lexical-v1.0.0'
export const LEXICALDECISION_PSEUDOWORD_GENERATOR_VERSION = 'zh-pseudoword-generator-v1.0.0'

export const lexicaldecisionConfigSchema = z.object({
  totalTrials: z.union([z.literal(40), z.literal(100), z.literal(200)]),
  realWordRatio: z.literal(0.5),
  stimulusMs: z.number().int().min(100).max(5000),
  trialTimeoutMs: z.number().int().min(500).max(10000),
  isiMs: z.number().int().min(0).max(2000),
  validRtFloorMs: z.number().int().min(50).max(1000),
  stimulusSetVersion: z.literal(LEXICALDECISION_STIMULUS_SET_VERSION),
  pseudowordGeneratorVersion: z.literal(LEXICALDECISION_PSEUDOWORD_GENERATOR_VERSION),
  report: reportMetaSchema,
}).strict()

export type LexicaldecisionConfig = z.infer<typeof lexicaldecisionConfigSchema>
