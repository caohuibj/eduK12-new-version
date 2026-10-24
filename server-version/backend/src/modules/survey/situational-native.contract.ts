import { z } from 'zod'

/** Frozen by the server at publication, never selected by a participant request.
 * This module alone does not enable native catalog import or public admission. */
export const SURVEY_NATIVE_SJT_PROTOCOL = 'SITUATIONAL_NATIVE_V1' as const
export type SurveySituationalExecutionProtocol = 'SURVEY_FINAL_V1' | typeof SURVEY_NATIVE_SJT_PROTOCOL

export class SurveySituationalProtocolError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'SurveySituationalProtocolError' }
}

/** Missing means the historical inline protocol. Null and future versions must
 * not silently fall back to the old answer parser. */
export function surveySituationalExecutionProtocol(unit: { kind: string; executionProtocol?: unknown }): SurveySituationalExecutionProtocol {
  if (unit.kind !== 'SJT') throw new SurveySituationalProtocolError('SURVEY_SJT_KIND_REQUIRED')
  if (unit.executionProtocol === undefined) return 'SURVEY_FINAL_V1'
  if (unit.executionProtocol === SURVEY_NATIVE_SJT_PROTOCOL) return SURVEY_NATIVE_SJT_PROTOCOL
  throw new SurveySituationalProtocolError('SURVEY_SJT_PROTOCOL_UNSUPPORTED')
}

const key = z.string().min(1).max(240)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
/** Only an identity reference travels in the parent FINAL command. Answers and
 * results remain in the existing Situational raw/fact storage. Parsing a
 * reference is not proof of completion or permission. */
export const surveySituationalReceiptReferenceSchema = z.object({
  protocol: z.literal(SURVEY_NATIVE_SJT_PROTOCOL),
  attemptId: key,
  submissionId: z.string().guid(),
  payloadHash: hash,
}).strict()
export type SurveySituationalReceiptReference = z.infer<typeof surveySituationalReceiptReferenceSchema>

export interface SurveySituationalReceiptScope {
  surveyAttemptId: string
  surveyPublicationId: string
  surveySlotKey: string
  attemptEpoch: number
  instrumentKey: string
  instrumentVersion: string
  definitionHash: string
  compiledRuntimeHash: string
  scoringVersion: string
}
export interface SurveySituationalStoredReceipt extends SurveySituationalReceiptScope {
  id: string
  status: string
  submissionId: string | null
  submissionPayloadHash: string | null
  canonicalResultEncrypted: string | null
}

/** Called only after current Survey authority and the child row are locked in
 * the SAME transaction. Every expected field comes from the frozen server
 * publication/admission, not from client `completed` or child metadata. */
export function assertSurveySituationalReceiptBinding(
  reference: unknown,
  expected: SurveySituationalReceiptScope,
  stored: SurveySituationalStoredReceipt,
): SurveySituationalReceiptReference {
  const parsed = surveySituationalReceiptReferenceSchema.safeParse(reference)
  if (!parsed.success) throw new SurveySituationalProtocolError('SURVEY_SJT_RECEIPT_INVALID')
  const fields = ['surveyAttemptId', 'surveyPublicationId', 'surveySlotKey', 'attemptEpoch',
    'instrumentKey', 'instrumentVersion', 'definitionHash', 'compiledRuntimeHash', 'scoringVersion'] as const
  if (!Number.isInteger(expected.attemptEpoch) || expected.attemptEpoch < 1
    || fields.some(field => expected[field] !== stored[field])
    || parsed.data.attemptId !== stored.id
    || parsed.data.submissionId !== stored.submissionId
    || parsed.data.payloadHash !== stored.submissionPayloadHash)
    throw new SurveySituationalProtocolError('SURVEY_SJT_RECEIPT_SCOPE_MISMATCH')
  if (stored.status !== 'COMPLETED' || !stored.canonicalResultEncrypted)
    throw new SurveySituationalProtocolError('SURVEY_SJT_RECEIPT_NOT_COMPLETED')
  return parsed.data
}
