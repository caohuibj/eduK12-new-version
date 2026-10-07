import { createHash } from 'node:crypto'

export type InstrumentDeliveryMode = 'LEGACY' | 'FINAL_ONLY'

export type FinalSubmitErrorCode =
  | 'FORM_ANSWER_INVALID'
  | 'LEGACY_WRITE_DISABLED'
  | 'STALE_ATTEMPT'
  | 'SUBMISSION_PAYLOAD_CONFLICT'
  | 'SUBMISSION_PAYLOAD_TOO_LARGE'
  | 'SUBMISSION_ID_INVALID'
  | 'DEFINITION_MISMATCH'
  | 'SUBMISSION_ALREADY_IN_PROGRESS'
  | 'INSTRUMENT_NOT_AVAILABLE'

export const FINAL_SUBMISSION_MAX_BYTES = {
  formSection: 512 * 1024,
  scale: 512 * 1024,
  cognitive: 1536 * 1024,
  situational: 512 * 1024,
} as const

export class InstrumentFinalSubmitError extends Error {
  readonly statusCode: number
  readonly code: FinalSubmitErrorCode

  constructor(code: FinalSubmitErrorCode, message: string, statusCode = 409) {
    super(message)
    this.name = 'InstrumentFinalSubmitError'
    this.code = code
    this.statusCode = statusCode
  }
}

export type CanonicalSubmission = {
  json: string
  bytes: number
  hash: string
}

/**
 * Final-submit hashes must be stable across retries and independent of JSON
 * property insertion order. Array order is intentionally preserved because it
 * is meaningful for cognitive trials and duplicate answer telemetry.
 */
const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    )
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '提交数据包含无效数字', 400)
  }
  return value
}

export const stableSubmissionJson = (payload: unknown): string => JSON.stringify(stableValue(payload))

/**
 * Canonicalize a final-submit payload once and reuse the result for the size
 * guard and idempotency hash.  Final submits can contain hundreds of answers
 * or trials, so repeating the deep sort/stringify pass is measurable CPU.
 */
export const prepareCanonicalSubmission = (payload: unknown): CanonicalSubmission => {
  const json = stableSubmissionJson(payload)
  return {
    json,
    bytes: Buffer.byteLength(json, 'utf8'),
    hash: createHash('sha256').update(json, 'utf8').digest('hex'),
  }
}

export const computeSubmissionPayloadHash = (payload: unknown): string => prepareCanonicalSubmission(payload).hash

/**
 * The Express body limit is a final safety net. These smaller limits keep a
 * single instrument from consuming the whole request budget and make the
 * final-submit contract explicit per instrument.
 */
export const assertSubmissionPayloadSize = (
  payload: unknown,
  maxBytes: number,
  label = '提交数据',
): void => {
  assertCanonicalSubmissionPayloadSize(prepareCanonicalSubmission(payload), maxBytes, label)
}

export const assertCanonicalSubmissionPayloadSize = (
  canonical: Pick<CanonicalSubmission, 'bytes'>,
  maxBytes: number,
  label = '提交数据',
): void => {
  if (canonical.bytes > maxBytes) {
    throw new InstrumentFinalSubmitError(
      'SUBMISSION_PAYLOAD_TOO_LARGE',
      `${label}过大，请减少内容后重试（最大 ${Math.floor(maxBytes / 1024)}KB）`,
      413,
    )
  }
}

export const validateSubmissionId = (submissionId: unknown): string => {
  if (typeof submissionId !== 'string' || submissionId.length < 16 || submissionId.length > 200) {
    throw new InstrumentFinalSubmitError('SUBMISSION_ID_INVALID', 'submissionId 无效', 400)
  }
  return submissionId
}

export const assertFinalOnly = (deliveryMode: InstrumentDeliveryMode | string | null | undefined): void => {
  if (deliveryMode !== 'FINAL_ONLY') {
    throw new InstrumentFinalSubmitError(
      'LEGACY_WRITE_DISABLED',
      '该测评记录属于旧提交模式，请只读查看或重启后重新作答',
      410,
    )
  }
}

export const assertAttemptEpoch = (actual: number, requested: number): void => {
  if (!Number.isInteger(requested) || requested < 1 || actual !== requested) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '测评尝试已过期，请重启后重新作答', 409)
  }
}

/**
 * Admission only permits an active attempt or an already-completed attempt
 * carrying the same idempotent submission. Completed attempts still proceed
 * to canonicalization so replay can verify the payload, while terminal states
 * are rejected before scoring, encryption, or other heavy preparation.
 */
export const assertFinalSubmitStatus = (
  status: string | null | undefined,
  label = '测评',
): void => {
  if (status !== 'IN_PROGRESS' && status !== 'COMPLETED') {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', `${label}已结束，请重启后重新作答`, 409)
  }
}

export const assertDefinitionHash = (actual: string | null | undefined, requested: string): void => {
  if (!actual || actual !== requested) {
    throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '测评定义已变化，请重新开始本次测评', 409)
  }
}

export const assertSubmissionReplay = (
  existing: { submissionId?: string | null; submissionPayloadHash?: string | null } | null | undefined,
  submissionId: string,
  payloadHash: string,
): 'new' | 'replay' => {
  if (!existing?.submissionId) return 'new'
  if (existing.submissionId !== submissionId || existing.submissionPayloadHash !== payloadHash) {
    throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', 'submissionId 已用于其他提交内容', 409)
  }
  return 'replay'
}

export const isInstrumentFinalSubmitError = (error: unknown): error is InstrumentFinalSubmitError => (
  error instanceof InstrumentFinalSubmitError
)
