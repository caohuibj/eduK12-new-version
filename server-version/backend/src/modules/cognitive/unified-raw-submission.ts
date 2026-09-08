import { z } from 'zod'
import type { TrialEnvelope } from './v2/types'
import { trialEnvelopeSchema } from './v2/trial-envelope'
import {
  administrationProvenanceV1Schema,
  type AdministrationProvenanceV1,
} from './administration-provenance'

export const UNIFIED_COGNITIVE_RAW_PAYLOAD_SCHEMA_VERSION = 1 as const
export const UNIFIED_COGNITIVE_RAW_ENCODING_VERSION = 'CANONICAL_JSON_SHA256_V1' as const

const unifiedCognitiveRawSubmissionPayloadSchema = z.object({
  schemaVersion: z.literal(UNIFIED_COGNITIVE_RAW_PAYLOAD_SCHEMA_VERSION),
  attemptEpoch: z.number().int().positive(),
  trials: z.array(trialEnvelopeSchema).min(1).max(1000),
  administrationProvenance: administrationProvenanceV1Schema.optional(),
}).strict()

const normalizedCognitiveRawSubmissionPayloadSchema = z.object({
  schemaVersion: z.literal(UNIFIED_COGNITIVE_RAW_PAYLOAD_SCHEMA_VERSION),
  attemptEpoch: z.number().int().positive(),
  trials: z.array(z.unknown()).min(1).max(1000),
  administrationProvenance: administrationProvenanceV1Schema.optional(),
}).strict()

export type UnifiedCognitiveRawSubmissionPayload = {
  schemaVersion: typeof UNIFIED_COGNITIVE_RAW_PAYLOAD_SCHEMA_VERSION
  attemptEpoch: number
  trials: TrialEnvelope[]
  administrationProvenance?: AdministrationProvenanceV1
}

export const createUnifiedCognitiveRawSubmissionPayload = (input: {
  attemptEpoch: number
  trials: TrialEnvelope[]
  administrationProvenance?: AdministrationProvenanceV1
}): UnifiedCognitiveRawSubmissionPayload => {
  // The final-submit boundary already parsed and normalized every envelope
  // and task payload. Validate only the outer shape here so the persistence
  // path does not parse every trial a second time.
  normalizedCognitiveRawSubmissionPayloadSchema.parse({
    schemaVersion: UNIFIED_COGNITIVE_RAW_PAYLOAD_SCHEMA_VERSION,
    attemptEpoch: input.attemptEpoch,
    trials: input.trials,
    ...(input.administrationProvenance
      ? { administrationProvenance: input.administrationProvenance }
      : {}),
  })
  return {
    schemaVersion: UNIFIED_COGNITIVE_RAW_PAYLOAD_SCHEMA_VERSION,
    attemptEpoch: input.attemptEpoch,
    trials: input.trials,
    ...(input.administrationProvenance
      ? { administrationProvenance: input.administrationProvenance }
      : {}),
  }
}

export const parseUnifiedCognitiveRawSubmissionPayload = (
  value: unknown,
): UnifiedCognitiveRawSubmissionPayload => unifiedCognitiveRawSubmissionPayloadSchema.parse(value) as UnifiedCognitiveRawSubmissionPayload
