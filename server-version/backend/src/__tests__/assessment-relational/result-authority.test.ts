import { describe, expect, it } from 'vitest'
import { dispositionFromFrozenRelationalAttemptIdentity, resolveRelationalCompositeResultDisposition } from '../../modules/assessment-relational/result-authority'

describe('RA-02 frozen relational result authority', () => {
  it('keeps non-relational attempts unchanged', () => {
    expect(dispositionFromFrozenRelationalAttemptIdentity(null)).toBe('NON_RELATIONAL')
    expect(dispositionFromFrozenRelationalAttemptIdentity({
      assignmentRef: null,
      respondentType: null,
    })).toBe('NON_RELATIONAL')
  })

  it('allows frozen Parent/Teacher observer identities to keep individual results', () => {
    expect(dispositionFromFrozenRelationalAttemptIdentity({
      assignmentRef: 'assignment-parent',
      respondentType: 'PARENT',
    })).toBe('INDIVIDUAL_ALLOWED')
    expect(dispositionFromFrozenRelationalAttemptIdentity({
      assignmentRef: 'assignment-teacher',
      respondentType: 'TEACHER',
    })).toBe('INDIVIDUAL_ALLOWED')
  })

  it('fails closed for assignment-bound identities without a legacy observer respondentType', () => {
    expect(dispositionFromFrozenRelationalAttemptIdentity({
      assignmentRef: 'assignment-student-teacher',
      respondentType: null,
    })).toBe('COHORT_ONLY')
    expect(dispositionFromFrozenRelationalAttemptIdentity({
      assignmentRef: 'assignment-future',
      respondentType: 'UNKNOWN',
    })).toBe('COHORT_ONLY')
  })
  it.each(['PARENT', 'TEACHER'])('checks frozen visibility before exposing %s runtime results', async (respondentType) => {
    const db = (policy: unknown[]) => ({
      compositeAssessmentAttempt: { findUnique: async () => ({ assignmentRef: 'protected', respondentType }) },
      $queryRaw: async () => policy,
    })
    await expect(resolveRelationalCompositeResultDisposition('attempt', db([{ perspective: 'OBSERVER_REPORT', analysisMode: 'COHORT_AGGREGATE' }]))).resolves.toBe('COHORT_ONLY')
    await expect(resolveRelationalCompositeResultDisposition('attempt', db([{ perspective: 'RELATIONAL_EXPERIENCE', analysisMode: 'INDIVIDUAL_ONLY' }]))).resolves.toBe('COHORT_ONLY')
    await expect(resolveRelationalCompositeResultDisposition('attempt', db([]))).resolves.toBe('COHORT_ONLY')
    await expect(resolveRelationalCompositeResultDisposition('attempt', db([{ perspective: 'OBSERVER_REPORT', analysisMode: 'INDIVIDUAL_ONLY' }]))).resolves.toBe('INDIVIDUAL_ALLOWED')
  })

})
