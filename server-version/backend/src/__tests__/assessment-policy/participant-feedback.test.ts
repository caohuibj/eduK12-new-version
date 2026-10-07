import { describe, expect, it, vi } from 'vitest'
import { isCompositeParticipantFeedbackDeferred } from '../../modules/assessment-policy/participant-feedback'
import { projectRelationalUnitFinalResponse } from '../../modules/assessment-relational/result-authority'

describe('participant feedback after the whole composite completes', () => {
  it('retains standalone feedback without reading a parent', async () => {
    const findUnique = vi.fn(), db = { compositeAssessmentAttempt: { findUnique } }
    expect(await isCompositeParticipantFeedbackDeferred(null, db)).toBe(false)
    expect(await projectRelationalUnitFinalResponse(null, { replayed: false, response: { metrics: { fixture: 1 } } }, db)).toHaveProperty('response')
    expect(findUnique).not.toHaveBeenCalled()
  })
  it.each(['IN_PROGRESS', 'ABANDONED', null])('returns only a durable acknowledgement for parent %s', async status => {
    const db = { compositeAssessmentAttempt: { findUnique: vi.fn().mockResolvedValue(status ? { status, assignmentRef: null } : null) } }
    const result = await projectRelationalUnitFinalResponse('parent', { submissionId: 'final', payloadHash: 'hash', replayed: true, response: { report: 'PRIVATE_FEEDBACK', metrics: { fixture: 1 } } }, db)
    expect(result).toEqual({ submissionId: 'final', payloadHash: 'hash', replayed: true, completed: true, feedbackDeferred: true })
  })
  it('opens ordinary completed feedback but keeps cohort-only completed feedback withheld', async () => {
    const findUnique = vi.fn().mockResolvedValue({ status: 'COMPLETED', assignmentRef: null })
    const db = { compositeAssessmentAttempt: { findUnique } }, data = { replayed: false, response: { report: 'frozen' } }
    expect(await projectRelationalUnitFinalResponse('parent', data, db)).toEqual(data)
    findUnique.mockResolvedValue({ status: 'COMPLETED', assignmentRef: 'relational', respondentType: null })
    expect(await projectRelationalUnitFinalResponse('parent', data, db)).toEqual({ replayed: false, completed: true })
  })
})
