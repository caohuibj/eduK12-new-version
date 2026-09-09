import type { Prisma } from '@prisma/client'
import { decryptUnifiedRuntimePayload } from './security'
import { parseCanonicalUnitResultEnvelope, type CanonicalUnitResultEnvelopeV1 } from './unit-result'

export type AssessmentUnitSnapshotPayloadKind = 'UNIT_RESULT' | 'COLLECTION_FACTS' | 'NONE'

export interface CompletedUnitSnapshotInput {
  questionnaireAssessmentId?: string
  compositeAttemptId?: string
  attemptEpoch: number
  slotKey: string
  unitType: 'SCALE' | 'COGNITIVE' | 'FORM_SECTION' | 'SITUATIONAL'
  payloadKind: AssessmentUnitSnapshotPayloadKind
  sourceType: string
  sourceAttemptId: string
  sourceSubmissionId?: string
  sourceDefinitionHash?: string
  compiledRuntimeHash?: string
  canonicalResultEncrypted?: string
  collectionFactsEncrypted?: string
  completedAt: Date
}

export const insertCompletedUnitSnapshot = async (
  tx: Prisma.TransactionClient,
  input: CompletedUnitSnapshotInput,
) => {
  const parentCount = Number(Boolean(input.questionnaireAssessmentId)) + Number(Boolean(input.compositeAttemptId))
  if (parentCount !== 1) throw new Error('AssessmentUnitSnapshot requires exactly one parent')
  const hasCanonicalResult = Boolean(input.canonicalResultEncrypted)
  const hasCollectionFacts = Boolean(input.collectionFactsEncrypted)
  if (input.payloadKind === 'UNIT_RESULT' && (!hasCanonicalResult || hasCollectionFacts)) {
    throw new Error('UNIT_RESULT snapshot requires only canonicalResultEncrypted')
  }
  if (input.payloadKind === 'COLLECTION_FACTS' && (!hasCollectionFacts || hasCanonicalResult)) {
    throw new Error('COLLECTION_FACTS snapshot requires only collectionFactsEncrypted')
  }
  if (input.payloadKind === 'NONE' && (hasCanonicalResult || hasCollectionFacts)) {
    throw new Error('NONE snapshot must not carry an encrypted payload')
  }
  return tx.assessmentUnitSnapshot.create({
    data: {
      questionnaireAssessmentId: input.questionnaireAssessmentId,
      compositeAttemptId: input.compositeAttemptId,
      attemptEpoch: input.attemptEpoch,
      slotKey: input.slotKey,
      unitType: input.unitType,
      terminalState: 'COMPLETED',
      payloadKind: input.payloadKind,
      sourceType: input.sourceType,
      sourceAttemptId: input.sourceAttemptId,
      sourceSubmissionId: input.sourceSubmissionId,
      sourceDefinitionHash: input.sourceDefinitionHash,
      compiledRuntimeHash: input.compiledRuntimeHash,
      canonicalResultEncrypted: input.canonicalResultEncrypted,
      collectionFactsEncrypted: input.collectionFactsEncrypted,
      completedAt: input.completedAt,
    },
  })
}

export const parseStoredCanonicalUnitResult = (encrypted: string): CanonicalUnitResultEnvelopeV1 => (
  parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload<unknown>(encrypted))
)
