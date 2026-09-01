import { describe, expect, it } from 'vitest'
import {
  assertAttemptEpoch,
  assertDefinitionHash,
  assertFinalOnly,
  assertSubmissionPayloadSize,
  assertSubmissionReplay,
  computeSubmissionPayloadHash,
  FINAL_SUBMISSION_MAX_BYTES,
  InstrumentFinalSubmitError,
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

  it('distinguishes a replay from a submission payload conflict', () => {
    const hash = computeSubmissionPayloadHash({ answers: [{ itemCode: 'q1', responseValue: 1 }] })
    expect(assertSubmissionReplay({ submissionId: 'submission-123456', submissionPayloadHash: hash }, 'submission-123456', hash)).toBe('replay')
    expect(() => assertSubmissionReplay({ submissionId: 'submission-123456', submissionPayloadHash: hash }, 'submission-123456', 'different'))
      .toThrowError(InstrumentFinalSubmitError)
  })

  it('rejects legacy attempts and stale epochs/definitions', () => {
    expect(() => assertFinalOnly('LEGACY')).toThrowError(/旧提交模式/)
    expect(() => assertAttemptEpoch(3, 2)).toThrowError(/过期/)
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
