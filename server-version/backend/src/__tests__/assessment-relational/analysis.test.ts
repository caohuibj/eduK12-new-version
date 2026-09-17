import { describe, expect, it } from 'vitest'
import {
  RelationalAssessmentError,
  buildRelationalAssignment,
  createRelationalCohortAnalysisService,
  projectIndividualRelationalResult,
  projectRelationalCohortForSubject,
  resolveCourseTeacherStudentRelationship,
  resolveParentChildRelationship,
  type RelationalApplicabilityV1,
  type RelationalAssignmentRecordV1,
  type RelationalCohortAnalysisPolicyV1,
  type RelationalCanonicalResultProjectionV1,
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

const failCodeAsync = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run()
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

const complete = (assignment: RelationalAssignmentRecordV1): RelationalAssignmentRecordV1 => ({
  ...assignment,
  status: 'COMPLETED',
  startedAt: '2026-09-17T02:00:00.000Z',
  completedAt: '2026-09-17T02:10:00.000Z',
})

type CohortFixture = {
  assignment: RelationalAssignmentRecordV1
  result: RelationalCanonicalResultProjectionV1
}

const cohortResults = (count: number, input?: {
  teacherUserId?: string
  courseId?: string
  episodeId?: string
  applicability?: RelationalApplicabilityV1
}): CohortFixture[] => Array.from({ length: count }, (_, index) => {
  const respondentUserId = `student-${index + 1}`
  const teacherUserId = input?.teacherUserId ?? 'teacher-1'
  const courseId = input?.courseId ?? 'course-1'
  const episodeId = input?.episodeId ?? 'episode-classroom'
  const applicability = input?.applicability ?? classroomApplicability
  const assignment = buildRelationalAssignment({
    applicability,
    relationshipSnapshot: resolveCourseTeacherStudentRelationship({
      courseId,
      courseCreatorUserId: teacherUserId,
      membershipStudentUserId: respondentUserId,
      membershipStatus: 'ACTIVE',
      subjectUserId: teacherUserId,
      subjectRole: 'TEACHER',
      respondentUserId,
      respondentRole: 'STUDENT',
    }),
    perspective: 'RELATIONAL_EXPERIENCE',
    episodeId,
    createdByUserId: teacherUserId,
    consentId: null,
    assignmentId: `assignment-${teacherUserId}-${courseId}-${episodeId}-${applicability.resourceKey}-${index + 1}`,
  })
  return {
    assignment: complete(assignment),
    result: {
      canonicalResultHash: (index + 1).toString(16).padStart(64, '0'),
      metrics: {
        support: 2 + index,
        clarity: index === 0 ? null : 3 + index,
      },
    },
  }
})

const buildCohort = async (
  fixtures: CohortFixture[],
  requestedPolicy: RelationalCohortAnalysisPolicyV1 = policy,
  createdAt?: string,
) => {
  const assignments = new Map(fixtures.map((entry) => [entry.assignment.assignmentId, entry.assignment]))
  const results = new Map(fixtures.map((entry) => [entry.assignment.assignmentId, entry.result]))
  const service = createRelationalCohortAnalysisService({
    assignments: {
      findById: async (assignmentId) => assignments.get(assignmentId) ?? null,
    },
    canonicalResults: {
      loadForAssignment: async (assignment) => results.get(assignment.assignmentId) ?? null,
    },
  })
  return service.build({
    assignmentIds: fixtures.map((entry) => entry.assignment.assignmentId),
    policy: requestedPolicy,
    createdAt,
  })
}

describe('relational analysis and privacy', () => {
  it('suppresses cohort output below assignment-frozen minimum N', async () => {
    expect(await failCodeAsync(() => buildCohort(cohortResults(4)))).toBe('RELATIONAL_INSUFFICIENT_RESPONDENTS')
  })

  it('refuses caller attempts to lower minimum N below applicability', async () => {
    expect(await failCodeAsync(() => buildCohort(
      cohortResults(3),
      { ...policy, minimumRespondents: 3 },
    ))).toBe('RELATIONAL_MINIMUM_N')
  })

  it('builds aggregate-only metrics and suppresses a metric with insufficient valid N', async () => {
    const snapshot = await buildCohort(cohortResults(5), policy, '2026-09-17T03:00:00.000Z')
    expect(snapshot.respondentCount).toBe(5)
    expect(snapshot.minimumRespondents).toBe(5)
    expect(snapshot.courseId).toBe('course-1')
    expect(snapshot.episodeId).toBe('episode-classroom')
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

  it('refuses caller-supplied assignment ids that do not exist in persistence', async () => {
    const fixtures = cohortResults(5)
    const assignments = new Map(fixtures.map((entry) => [entry.assignment.assignmentId, entry.assignment]))
    const results = new Map(fixtures.map((entry) => [entry.assignment.assignmentId, entry.result]))
    const service = createRelationalCohortAnalysisService({
      assignments: { findById: async (id) => assignments.get(id) ?? null },
      canonicalResults: { loadForAssignment: async (assignment) => results.get(assignment.assignmentId) ?? null },
    })
    expect(await failCodeAsync(() => service.build({
      assignmentIds: [...fixtures.slice(0, 4).map((entry) => entry.assignment.assignmentId), 'fabricated-assignment'],
      policy,
    }))).toBe('RELATIONAL_COHORT_ASSIGNMENT_NOT_FOUND')
  })

  it('rejects non-completed assignments before aggregation', async () => {
    const inputs = cohortResults(5)
    inputs[0] = {
      ...inputs[0],
      assignment: { ...inputs[0].assignment, status: 'STARTED', completedAt: null },
    }
    expect(await failCodeAsync(() => buildCohort(inputs))).toBe('RELATIONAL_COHORT_ASSIGNMENT')
  })

  it('rejects cross-teacher, cross-course, cross-episode and cross-resource mixing', async () => {
    const base = cohortResults(5)
    const crossCourse = cohortResults(1, { courseId: 'course-2' })[0]
    expect(await failCodeAsync(() => buildCohort([...base.slice(0, 4), crossCourse]))).toBe('RELATIONAL_COHORT_SCOPE')

    const crossEpisode = cohortResults(1, { episodeId: 'episode-other' })[0]
    expect(await failCodeAsync(() => buildCohort([...base.slice(0, 4), crossEpisode]))).toBe('RELATIONAL_COHORT_SCOPE')

    const crossTeacher = cohortResults(1, { teacherUserId: 'teacher-2' })[0]
    expect(await failCodeAsync(() => buildCohort([...base.slice(0, 4), crossTeacher]))).toBe('RELATIONAL_COHORT_SCOPE')

    const otherResource: RelationalApplicabilityV1 = {
      ...classroomApplicability,
      resourceKey: 'other_classroom_environment_v1',
    }
    const crossResource = cohortResults(1, { applicability: otherResource })[0]
    expect(await failCodeAsync(() => buildCohort([...base.slice(0, 4), crossResource]))).toBe('RELATIONAL_COHORT_SCOPE')
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
