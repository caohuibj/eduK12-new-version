import { situationalOnlineResponseSchema, type SituationalOnlineResponse } from './situational-final-submit.schema'
import { researchCaptureSchema, type SituationalResearchCapture } from './situation-scientific-contract'
import { z } from 'zod'
import type { SituationalResponse } from './situation-scoring'

export const SITUATIONAL_RAW_PAYLOAD_SCHEMA_VERSION = 1 as const
export const SITUATIONAL_RAW_ENCODING_VERSION = 'situational-raw-submit-v1' as const

const situationalResponseSchema = z.object({
  sceneKey: z.string().min(1),
  channelKey: z.string().min(1),
  responseValue: z.union([z.string(), z.number().finite()]),
  responseTimeMs: z.number().finite().nonnegative().int().optional(),
  answeredAt: z.string().min(1).optional(),
  responseRevision: z.number().int().positive().max(4096).optional(),
  historyIdentity: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  stageConfirmed: z.boolean().optional(),
}).strict()

export const situationalRawSubmissionPayloadSchema = z.object({
  schemaVersion: z.literal(SITUATIONAL_RAW_PAYLOAD_SCHEMA_VERSION),
  attemptEpoch: z.number().int().positive(),
  // The array is the only participant payload persisted. It contains raw
  // scene/channel values and never client-provided scores or derived fields.
  researchCapture: researchCaptureSchema.optional(),
  responses: z.array(situationalResponseSchema).min(1).max(1000),
}).strict()

export type SituationalRawSubmissionPayloadV1 = {
  schemaVersion: typeof SITUATIONAL_RAW_PAYLOAD_SCHEMA_VERSION
  attemptEpoch: number
  responses: SituationalResponse[]
  researchCapture?: SituationalResearchCapture
}

export const createSituationalRawSubmissionPayload = (input: {
  attemptEpoch: number
  responses: SituationalResponse[]
  researchCapture?: SituationalResearchCapture
}): SituationalRawSubmissionPayloadV1 => situationalRawSubmissionPayloadSchema.parse({
  schemaVersion: SITUATIONAL_RAW_PAYLOAD_SCHEMA_VERSION,
  attemptEpoch: input.attemptEpoch,
  responses: input.responses,
  ...(input.researchCapture ? { researchCapture: input.researchCapture } : {}),
})

export const SITUATIONAL_ONLINE_RAW_ENCODING_VERSION = 'situational-raw-submit-v2' as const
export const situationalOnlineRawSubmissionPayloadSchema = z.object({
  schemaVersion: z.literal(2),
  attemptEpoch: z.number().int().positive(),
  responseProtocol: z.literal('sjt-online-response-v1'),
  researchCapture: researchCaptureSchema.optional(),
  // Derived scorer inputs are retained for existing research reconstruction.
  responses: z.array(situationalResponseSchema).max(1000),
  // Authoritative participant selections, never derived combination option keys.
  rawResponses: z.array(situationalOnlineResponseSchema).max(1000),
}).strict()
export type SituationalRawSubmissionPayloadV2 = z.infer<typeof situationalOnlineRawSubmissionPayloadSchema>
export const createSituationalOnlineRawSubmissionPayload = (input: {
  attemptEpoch: number
  responses: SituationalResponse[]
  rawResponses: SituationalOnlineResponse[]
  researchCapture?: SituationalResearchCapture
}): SituationalRawSubmissionPayloadV2 => situationalOnlineRawSubmissionPayloadSchema.parse({
  ...input, schemaVersion: 2, responseProtocol: 'sjt-online-response-v1',
})
export const parseSituationalRawSubmissionPayload = (value: unknown): SituationalRawSubmissionPayloadV1 | SituationalRawSubmissionPayloadV2 => (
  z.union([situationalRawSubmissionPayloadSchema, situationalOnlineRawSubmissionPayloadSchema]).parse(value)
)
