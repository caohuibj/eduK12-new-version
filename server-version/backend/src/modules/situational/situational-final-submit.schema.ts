import { researchCaptureSchema, type SituationalResearchCapture } from './situation-scientific-contract'
import { z } from 'zod'

const responseSchema = z.object({
  sceneKey: z.string().min(1),
  channelKey: z.string().min(1),
  responseValue: z.union([z.string(), z.number().finite()]),
  responseTimeMs: z.number().finite().nonnegative().int().optional(),
  answeredAt: z.string().min(1).optional(),
  responseRevision: z.number().int().positive().max(4096).optional(),
  historyIdentity: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  stageConfirmed: z.boolean().optional(),
}).strict()

export const situationalStartSchema = z.object({
  instrumentKey: z.string().min(1),
  instrumentVersion: z.string().min(1).optional(),
}).strict()

/**
 * The final request carries only raw responses plus runtime identity. Any
 * score, contribution, quality, band or percentile field is rejected by the
 * strict response object and is never trusted by the server.
 */
export const situationalFinalSubmitSchema = z.object({
  submissionId: z.string().min(16).max(200),
  attemptEpoch: z.number().int().positive(),
  definitionHash: z.string().regex(/^[0-9a-f]{64}$/),
  instrumentVersion: z.string().min(1).optional(),
  compiledRuntimeHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  scoringVersion: z.string().min(1).optional(),
  researchCapture: researchCaptureSchema.optional(),
  responses: z.array(responseSchema).min(1).max(1000),
}).strict()

export type SituationalStartInput = z.infer<typeof situationalStartSchema>
export type SituationalFinalSubmitInput = z.infer<typeof situationalFinalSubmitSchema>
