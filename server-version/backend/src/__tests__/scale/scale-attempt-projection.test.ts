import { describe, expect, it } from 'vitest'
import { scaleAssessmentForResponse } from '../../modules/scale/scale-workflow.service'

const scale = {
  id: 'scale-1',
  code: 'adexi_v1',
  name: 'ADEXI',
  description: 'desc',
  instrumentVersion: '2.0.0',
  instrumentClass: 'STANDARD' as const,
  definition: { secret: 'must-not-leak' },
}

describe('Scale attempt strict response projection', () => {
  it('allowlists resume fields and does not spread future internal columns', () => {
    const response = scaleAssessmentForResponse({
      id: 'assessment-1',
      scaleId: 'scale-1',
      status: 'IN_PROGRESS',
      progress: 50,
      answersRevision: 2,
      answers: [{ itemCode: 'i1', responseValue: 1 }],
      result: null,
      startedAt: new Date('2026-09-21T00:00:00.000Z'),
      scale,
      frozenAdmissionSnapshotEncrypted: 'sentinel-admission',
      futureEncryptedInternalColumn: 'sentinel-future',
      internalHash: 'sentinel-hash',
    })
    expect(response.answers).toEqual([{ itemCode: 'i1', responseValue: 1 }])
    expect(response.scale).not.toHaveProperty('definition')
    expect(response).not.toHaveProperty('frozenAdmissionSnapshotEncrypted')
    expect(response).not.toHaveProperty('futureEncryptedInternalColumn')
    expect(response).not.toHaveProperty('internalHash')
  })

  it('does not return resume answers to an explicitly declared teacher audience', () => {
    const response = scaleAssessmentForResponse({
      id: 'assessment-1',
      scaleId: 'scale-1',
      status: 'IN_PROGRESS',
      answers: [{ itemCode: 'i1', responseValue: 1 }],
      result: null,
      scale,
    }, { audience: 'teacher', purpose: 'history' })
    expect(response).not.toHaveProperty('answers')
  })

  it('infers the teacher-list audience from the server-selected user relation, not a request parameter', () => {
    const response = scaleAssessmentForResponse({
      id: 'assessment-1',
      scaleId: 'scale-1',
      status: 'IN_PROGRESS',
      answers: [{ itemCode: 'i1', responseValue: 'PRIVATE_RESUME_ANSWER' }],
      result: null,
      scale,
      user: { id: 'student-1', username: 'student', nickname: 'Student' },
    })
    expect(response.user).toEqual({ id: 'student-1', username: 'student', nickname: 'Student' })
    expect(response).not.toHaveProperty('answers')
    expect(JSON.stringify(response)).not.toContain('PRIVATE_RESUME_ANSWER')
  })

  it('fails closed for a malformed completed result instead of returning the persisted object', () => {
    const response = scaleAssessmentForResponse({
      id: 'assessment-1',
      scaleId: 'scale-1',
      status: 'COMPLETED',
      progress: 100,
      answers: [{ itemCode: 'i1', responseValue: 'SECRET_RAW_ANSWER' }],
      result: { futureAuthoritativePayload: 'SECRET_RESULT', scores: [{ value: 999 }] },
      completedAt: new Date('2026-09-21T00:05:00.000Z'),
      scale,
    })
    expect(response.report).toMatchObject({ kind: 'unavailable', reason: 'RESULT_UNAVAILABLE' })
    expect(response.result).toBeNull()
    expect(JSON.stringify(response)).not.toContain('SECRET_RAW_ANSWER')
    expect(JSON.stringify(response)).not.toContain('SECRET_RESULT')
    expect(JSON.stringify(response)).not.toContain('999')
  })
})
