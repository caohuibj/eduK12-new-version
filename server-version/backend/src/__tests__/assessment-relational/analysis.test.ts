import { describe, expect, it } from 'vitest'
import {
  RelationalAssessmentError,
  buildRelationalAssignment,
  buildRelationalCohortAnalysis,
  projectIndividualRelationalResult,
  projectRelationalCohortForSubject,
  resolveCourseTeacherStudentRelationship,
  resolveParentChildRelationship,
  type RelationalApplicabilityV1,
  type RelationalCohortAnalysisPolicyV1,
} from '../../modules/assessment-relational'
import type { ParentStudentRelationshipRecordV1 } from '../../modules/assessment-identity/types'

const failCode = (run: () => unknown): string => {
  try {
    run()
    throw new Error('expected RelationalAssessmentError')
  } catch (error) {
    if (error instanceof RelationalAssessmentError) return error.code
    throw error
  }
}

const policy: RelationalCohortAnalysisPolicyV1 = {
  schemaVersion: 1,
  policyKey: 'classroom_environment_cohort_v1',
  policyVersion: '1.0.0',
  minimumRespondents: 5,
  metricKeys: ['support', 'clarity'],
}

const classroomApplicability: RelationalApplicabilityV1 = {
  schemaVersion: 1,
  resourceKind: 'BUNDLE',
  resourceKey: 'classroom_environment_student_report_v1',
  resourceVersion: '1.0.0',
  subjectRoles: ['TEACHER'],
  respondentRoles: ['STUDENT'],
  relationshipKinds: ['COURSE_TEACHER_STUDENT'],
  perspectives: ['RELATIONAL_EXPERIENCE'],
  analysisMode: 'COHORT_AGGREGATE',
  visibilityPolicyKey: 'student_teacher_aggregate_only_v1',
  minimumRespondents: 5,
}

const results = (count: number) => Array.from({ length: count }, (_, index) => ({
  assignmentId: `assignment-${index + 1}`,
  respondentUserId: `student-${index + 1}`,
  canonicalResultHash: (index + 1).toString(16).padStart(64, '0'),
  metrics: {
    support: 2 + index,
    clarity: index === 0 ? null : 3 + index,
  },
}))

describe('relational analysis and privacy', () => {
  it('suppresses cohort output below minimum N', () => {
    expect(failCode(() => buildRelationalCohortAnalysis({
      subjectUserId: 'teacher-1',
      resourceKind: 'BUNDLE',
      resourceKey: 'classroom_environment_student_report_v1',
      resourceVersion: '1.0.0',
      policy,
      results: results(4),
    }))).toBe('RELATIONAL_INSUFFICIENT_RESPONDENTS')
  })

  it('builds aggregate-only metrics and suppresses a metric with insufficient valid N', () => {
    const snapshot = buildRelationalCohortAnalysis({
      subjectUserId: 'teacher-1',
      resourceKind: 'BUNDLE',
      resourceKey: 'classroom_environment_student_report_v1',
      resourceVersion: '1.0.0',
      policy,
      results: results(5),
      createdAt: '2026-09-17T03:00:00.000Z',
    })
    expect(snapshot.respondentCount).toBe(5)
    expect(snapshot.metrics.support).toMatchObject({ state: 'present', validN: 5, mean: 4 })
    expect(snapshot.metrics.clarity).toEqual({ state: 'insufficient', validN: 4, missingN: 1 })
    expect(snapshot.inputResultHashes).toHaveLength(5)

    const projection = projectRelationalCohortForSubject({ snapshot, viewerUserId: 'teacher-1' })
    expect('inputResultHashes' in projection).toBe(false)
    expect(JSON.stringify(projection)).not.toContain('student-1')
    expect(failCode(() => projectRelationalCohortForSubject({
      snapshot,
      viewerUserId: 'teacher-2',
    }))).toBe('RELATIONAL_ANALYSIS_ACCESS')
  })

  it('never exposes an individual Student -> Teacher relational-experience result', () => {
    const assignment = buildRelationalAssignment({
      applicability: classroomApplicability,
      relationshipSnapshot: resolveCourseTeacherStudentRelationship({
        courseId: 'course-1',
        courseCreatorUserId: 'teacher-1',
        membershipStudentUserId: 'student-1',
        membershipStatus: 'ACTIVE',
        subjectUserId: 'teacher-1',
        subjectRole: 'TEACHER',
        respondentUserId: 'student-1',
        respondentRole: 'STUDENT',
      }),
      perspective: 'RELATIONAL_EXPERIENCE',
      episodeId: 'episode-1',
      createdByUserId: 'teacher-1',
      consentId: null,
    })
    expect(failCode(() => projectIndividualRelationalResult({
      assignment,
      viewerUserId: 'teacher-1',
      viewerRole: 'TEACHER',
      canonicalResultHash: 'a'.repeat(64),
      reportProjection: { support: 1 },
    }))).toBe('RELATIONAL_ANALYSIS_ACCESS')
  })

  it('preserves observer individual projection but rejects raw-answer payloads', () => {
    const relationship: ParentStudentRelationshipRecordV1 = {
      relationshipId: 'rel-1',
      parentUserId: 'parent-1',
      studentUserId: 'student-1',
      status: 'ACTIVE',
      inviteCodeId: null,
      approvedByUserId: 'teacher-1',
      approvedAt: null,
      revokedByUserId: null,
      revokedAt: null,
      revokeReason: null,
      consentVersion: 'v1',
      consentHash: 'b'.repeat(64),
    }
    const observerApplicability: RelationalApplicabilityV1 = {
      schemaVersion: 1,
      resourceKind: 'BUNDLE',
      resourceKey: 'sdq_parent_observer_zh_cn_v1',
      resourceVersion: '1.0.0',
      subjectRoles: ['STUDENT'],
      respondentRoles: ['PARENT'],
      relationshipKinds: ['PARENT_CHILD'],
      perspectives: ['OBSERVER_REPORT'],
      analysisMode: 'INDIVIDUAL_ONLY',
      visibilityPolicyKey: 'observer_assigning_teacher_v1',
      minimumRespondents: null,
    }
    const assignment = buildRelationalAssignment({
      applicability: observerApplicability,
      relationshipSnapshot: resolveParentChildRelationship({
        relationship,
        subjectUserId: 'student-1',
        subjectRole: 'STUDENT',
        respondentUserId: 'parent-1',
        respondentRole: 'PARENT',
      }),
      perspective: 'OBSERVER_REPORT',
      episodeId: 'episode-1',
      createdByUserId: 'teacher-1',
      consentId: 'consent-1',
    })
    expect(projectIndividualRelationalResult({
      assignment,
      viewerUserId: 'teacher-1',
      viewerRole: 'TEACHER',
      canonicalResultHash: 'c'.repeat(64),
      reportProjection: { total: 12, band: 'descriptive' },
    }).report).toEqual({ total: 12, band: 'descriptive' })

    expect(failCode(() => projectIndividualRelationalResult({
      assignment,
      viewerUserId: 'parent-1',
      viewerRole: 'PARENT',
      canonicalResultHash: 'c'.repeat(64),
      reportProjection: { nested: { rawAnswers: ['secret'] } },
    }))).toBe('RELATIONAL_RAW_DISCLOSURE')
  })
})
