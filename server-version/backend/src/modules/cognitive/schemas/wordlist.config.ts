import { z } from 'zod'
import { reportMetaSchema } from './report-meta'

export const WORDLIST_NORMALIZATION_VERSION = 'wordlist-normalization-v1.0.0'
export const WORDLIST_STIMULUS_SET_VERSION = 'chinese-wordlist-v1.0.0'

export const wordlistConfigSchema = z.object({
  listLength: z.union([z.literal(8), z.literal(12), z.literal(15)]),
  learningRounds: z.union([z.literal(2), z.literal(3), z.literal(5)]),
  delayedEnabled: z.boolean(),
  delayedDelayMs: z.number().int().min(0).max(300000),
  studyMsPerWord: z.number().int().min(100).max(2000),
  recallTimeoutMs: z.number().int().min(1000).max(120000),
  inactivityGuardMs: z.number().int().min(1000).max(300000),
  inputMode: z.literal('typed-free-recall'),
  normalizationVersion: z.literal(WORDLIST_NORMALIZATION_VERSION),
  stimulusSetVersion: z.literal(WORDLIST_STIMULUS_SET_VERSION),
  report: reportMetaSchema,
}).strict()

export type WordlistConfig = z.infer<typeof wordlistConfigSchema>
