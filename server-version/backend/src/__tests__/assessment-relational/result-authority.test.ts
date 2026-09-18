import { describe, expect, it } from 'vitest'
import { dispositionFromFrozenRelationalAttemptIdentity } from '../../modules/assessment-relational/result-authority'

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
})
