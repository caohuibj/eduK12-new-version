import { describe, expect, it } from 'vitest'
import { validateRelationalApplicability } from '../../modules/assessment-relational/contracts'
import { validateOrganizationRelationalSnapshot } from '../../modules/assessment-relational/organization-contract'

describe('Organization relational actor/policy contracts', () => {
  it('accepts COUNSELOR/CLIENT and organization relationship kinds in applicability', () => {
    expect(validateRelationalApplicability({
      schemaVersion: 1,
      resourceKind: 'BUNDLE',
      resourceKey: 'counseling-demo',
      resourceVersion: '1.0.0',
      subjectRoles: ['CLIENT'],
      respondentRoles: ['COUNSELOR'],
      relationshipKinds: ['COUNSELOR_CLIENT'],
      perspectives: ['OBSERVER_REPORT'],
      analysisMode: 'INDIVIDUAL_ONLY',
      visibilityPolicyKey: 'ORG_COUNSELING_V1',
      minimumRespondents: null,
    })).toMatchObject({
      subjectRoles: ['CLIENT'],
      respondentRoles: ['COUNSELOR'],
      relationshipKinds: ['COUNSELOR_CLIENT'],
    })
  })

  it('validates CLASS_TEACHER_STUDENT from frozen roles without legacy User.role', () => {
    expect(validateOrganizationRelationalSnapshot({
      schemaVersion: 1,
      relationshipKind: 'CLASS_TEACHER_STUDENT',
      relationshipRef: 'staff-assignment-1',
      subjectUserId: 'student-user',
      subjectRole: 'STUDENT',
      respondentUserId: 'teacher-user',
      respondentRole: 'TEACHER',
      courseId: null,
      verifiedAt: new Date(0).toISOString(),
      facts: { source: 'organization-run' },
    })).toMatchObject({ relationshipKind: 'CLASS_TEACHER_STUDENT' })
  })

  it('rejects COUNSELOR_CLIENT with wrong frozen personas and organization relations with fake courseId', () => {
    expect(() => validateOrganizationRelationalSnapshot({
      schemaVersion: 1,
      relationshipKind: 'COUNSELOR_CLIENT',
      relationshipRef: 'professional-relation-1',
      subjectUserId: 'client-user',
      subjectRole: 'CLIENT',
      respondentUserId: 'teacher-user',
      respondentRole: 'TEACHER',
      courseId: null,
      verifiedAt: new Date(0).toISOString(),
      facts: {},
    })).toThrow(/COUNSELOR_CLIENT/)

    expect(() => validateOrganizationRelationalSnapshot({
      schemaVersion: 1,
      relationshipKind: 'CLASS_TEACHER_STUDENT',
      relationshipRef: 'staff-assignment-1',
      subjectUserId: 'student-user',
      subjectRole: 'STUDENT',
      respondentUserId: 'teacher-user',
      respondentRole: 'TEACHER',
      courseId: 'legacy-course-id',
      verifiedAt: new Date(0).toISOString(),
      facts: {},
    })).toThrow(/courseId/)
  })
})
