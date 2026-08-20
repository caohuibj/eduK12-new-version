import { z } from 'zod'

/**
 * Published cognitive configs must be validated before execution.
 * Runtime validation prevents malformed JSON configs from entering
 * assessment execution and scoring flows.
 */

const baseReportSchema = z.object({
  reportVersion: z.string().min(1),
  referenceMode: z.string().min(1),
  referenceVersion: z.string().min(1),
  referenceBand: z.string().min(1),
})

export const reactionConfigSchema = z.object({
  totalTrials: z.number().int().positive(),
  foreperiodMinMs: z.number().nonnegative(),
  foreperiodMaxMs: z.number().nonnegative(),
  timeoutMs: z.number().positive(),
  readyDurationMs: z.number().nonnegative(),
  qualityRules: z.object({
    minReactionTimeMs: z.number().nonnegative(),
    maxReactionTimeMs: z.number().positive(),
  }).optional(),
  report: baseReportSchema,
})

export const memoryConfigSchema = z.object({
  startLength: z.number().int().positive(),
  maxLength: z.number().int().positive(),
  trialsPerLevel: z.number().int().positive(),
  digitDisplayMs: z.number().positive(),
  digitIntervalMs: z.number().nonnegative(),
  readyDurationMs: z.number().nonnegative(),
  inactivityGuardMs: z.number().positive(),
  report: baseReportSchema,
})

export const stroopConfigSchema = z.object({
  totalTrials: z.number().int().positive(),
  congruentRatio: z.number().min(0).max(1),
  fixationMs: z.number().nonnegative(),
  stimulusDurationMs: z.number().positive(),
  isiMs: z.number().nonnegative(),
  qualityRules: z.object({
    minReactionTimeMs: z.number().nonnegative(),
    maxReactionTimeMs: z.number().positive(),
  }).optional(),
  report: baseReportSchema,
})

export function validateCognitiveConfig(testType: string, config: unknown) {
  switch (testType) {
    case 'reaction':
      return reactionConfigSchema.parse(config)
    case 'memory':
      return memoryConfigSchema.parse(config)
    case 'stroop':
      return stroopConfigSchema.parse(config)
    default:
      throw new Error(`Unsupported cognitive test type: ${testType}`)
  }
}
