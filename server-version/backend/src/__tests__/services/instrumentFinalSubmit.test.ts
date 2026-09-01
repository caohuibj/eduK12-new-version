import { describe, expect, it } from 'vitest'
import {
  assertAttemptEpoch,
  assertDefinitionHash,
  assertFinalOnly,
  assertFinalSubmitStatus,
  assertSubmissionPayloadSize,
  assertSubmissionReplay,
  computeSubmissionPayloadHash,
  FINAL_SUBMISSION_MAX_BYTES,
  InstrumentFinalSubmitError,
  prepareCanonicalSubmission,
  stableSubmissionJson,
  validateSubmissionId,
} from '../../services/instrumentFinalSubmit'

describe('instrument final-submit contract', () => {
  it('hashes object keys canonically while preserving array order', () => {
    expect(stableSubmissionJson({ b: 2, a: 1, nested: { z: true, c: false } }))
      .toBe('{"a":1,"b":2,"nested":{"c":false,"z":true}}')
    expect(computeSubmissionPayloadHash({ answers: ['first', 'second'] }))
      .not.toBe(computeSubmissionPayloadHash({ answers: ['second', 'first'] }))
  })

  it('prepares the canonical JSON, byte size, and replay hash in one contract', () => {
    const prepared = prepareCanonicalSubmission({ b: 2, a: 1 })
    expect(prepared.json).toBe('{"a":1,"b":2}')
    expect(prepared.bytes).toBe(Buffer.byteLength(prepared.json, 'utf8'))
    expect(prepared.hash).toBe(computeSubmissionPayloadHash({ a: 1, b: 2 }))
  })

  it('distinguishes a replay from a submission payload conflict', () => {
    const hash = computeSubmissionPayloadHash({ answers: [{ itemCode: 'q1', responseValue: 1 }] })
    expect(assertSubmissionReplay({ submissionId: 'submission-123456', submissionPayloadHash: hash }, 'submission-123456', hash)).toBe('replay')
    expect(() => assertSubmissionReplay({ submissionId: 'submission-123456', submissionPayloadHash: hash }, 'submission-123456', 'different'))
      .toThrowError(InstrumentFinalSubmitError)
  })

  it('rejects legacy attempts and stale epochs/definitions', () => {
    expect(() => assertFinalOnly('LEGACY')).toThrowError(/旧提交模式/)
    expect(() => assertAttemptEpoch(3, 2)).toThrowError(/过期/)
    expect(() => assertFinalSubmitStatus('ABANDONED', '量表测评')).toThrowError(/已结束/)
    expect(() => assertFinalSubmitStatus('INVALID')).toThrowError(InstrumentFinalSubmitError)
    expect(() => assertFinalSubmitStatus('IN_PROGRESS')).not.toThrow()
    expect(() => assertFinalSubmitStatus('COMPLETED')).not.toThrow()
    expect(() => assertDefinitionHash('server-definition', 'client-definition')).toThrowError(/定义已变化/)
    expect(validateSubmissionId('submission-123456')).toBe('submission-123456')
    expect(() => validateSubmissionId('short')).toThrowError(/submissionId 无效/)
  })

  it('enforces the per-instrument final payload budget', () => {
    expect(() => assertSubmissionPayloadSize(
      { answers: [{ itemCode: 'q1', responseValue: 'x'.repeat(FINAL_SUBMISSION_MAX_BYTES.scale) }] },
      FINAL_SUBMISSION_MAX_BYTES.scale,
      '量表提交数据',
    )).toThrowError(/过大/)
  })
})
