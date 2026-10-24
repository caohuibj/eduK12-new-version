import { describe, expect, it } from 'vitest'
import { SURVEY_NATIVE_SJT_PROTOCOL, surveySituationalExecutionProtocol,
  assertSurveySituationalReceiptBinding, type SurveySituationalReceiptScope,
  type SurveySituationalStoredReceipt } from '../../modules/survey/situational-native.contract'

const scope: SurveySituationalReceiptScope = {
  surveyAttemptId: 'parent', surveyPublicationId: 'publication', surveySlotKey: 'sjt', attemptEpoch: 1,
  instrumentKey: 'synthetic-staged', instrumentVersion: '1.0.0', definitionHash: 'a'.repeat(64),
  compiledRuntimeHash: 'b'.repeat(64), scoringVersion: 'author-key-sum-v1',
}
const reference = { protocol: SURVEY_NATIVE_SJT_PROTOCOL, attemptId: 'child',
  submissionId: '12345678-1234-4234-8234-123456789abc', payloadHash: 'c'.repeat(64) }
const stored: SurveySituationalStoredReceipt = { ...scope, id: 'child', status: 'COMPLETED',
  submissionId: reference.submissionId, submissionPayloadHash: reference.payloadHash,
  canonicalResultEncrypted: 'opaque-existing-canonical-result' }

describe('Survey native SJT frozen protocol and server receipt binding', () => {
  it('keeps absent historical protocol inline and recognizes only explicit native SJT', () => {
    expect(surveySituationalExecutionProtocol({kind: 'SJT'})).toBe('SURVEY_FINAL_V1')
    expect(surveySituationalExecutionProtocol({kind: 'SJT', executionProtocol: SURVEY_NATIVE_SJT_PROTOCOL})).toBe(SURVEY_NATIVE_SJT_PROTOCOL)
  })
  it.each([null, '', 'SURVEY_FINAL_V1', 'SITUATIONAL_NATIVE_V2', {}, false])('rejects unknown explicit protocol %j', executionProtocol => {
    expect(() => surveySituationalExecutionProtocol({kind: 'SJT', executionProtocol})).toThrow('SURVEY_SJT_PROTOCOL_UNSUPPORTED')
  })
  it('cannot mark a different unit family as native SJT', () => {
    expect(() => surveySituationalExecutionProtocol({kind: 'SCALE', executionProtocol: SURVEY_NATIVE_SJT_PROTOCOL})).toThrow('SURVEY_SJT_KIND_REQUIRED')
  })
  it('accepts only the same durable fact reference without copying raw answers or result', () => {
    expect(assertSurveySituationalReceiptBinding(reference, scope, stored)).toEqual(reference)
    expect(Object.keys(reference)).toEqual(['protocol', 'attemptId', 'submissionId', 'payloadHash'])
  })
  it.each(Object.keys(scope) as Array<keyof SurveySituationalReceiptScope>)('rejects a mismatching server %s', field => {
    expect(() => assertSurveySituationalReceiptBinding(reference, scope,
      {...stored, [field]: field === 'attemptEpoch' ? 2 : 'different'})).toThrow('SURVEY_SJT_RECEIPT_SCOPE_MISMATCH')
  })
  it.each(['attemptId', 'submissionId', 'payloadHash'] as const)('rejects a different client %s', field => {
    const other = field === 'submissionId' ? '12345678-1234-4234-8234-123456789abd' : field === 'payloadHash' ? 'd'.repeat(64) : 'other'
    expect(() => assertSurveySituationalReceiptBinding({...reference, [field]: other}, scope, stored)).toThrow('SURVEY_SJT_RECEIPT_SCOPE_MISMATCH')
  })
  it.each(['IN_PROGRESS', 'ABANDONED'])('cannot trust client completion over %s', status => {
    expect(() => assertSurveySituationalReceiptBinding(reference, scope, {...stored, status})).toThrow('SURVEY_SJT_RECEIPT_NOT_COMPLETED')
  })
  it('rejects missing canonical facts and extra client completion claims', () => {
    expect(() => assertSurveySituationalReceiptBinding(reference, scope, {...stored, canonicalResultEncrypted: null})).toThrow('SURVEY_SJT_RECEIPT_NOT_COMPLETED')
    expect(() => assertSurveySituationalReceiptBinding({...reference, completed: true}, scope, stored)).toThrow('SURVEY_SJT_RECEIPT_INVALID')
  })
})
