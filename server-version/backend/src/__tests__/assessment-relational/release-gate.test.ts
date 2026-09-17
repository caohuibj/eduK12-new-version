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
  type RelationalCanonicalResultProjectionV1,
} from '../../modules/assessment-relational'
import type { ParentStudentRelationshipRecordV1 } from '../../modules/assessment-identity/types'

const parentRelationship: ParentStudentRelationshipRecordV1 = {
  relationshipId: 'rel-1',
  parentUserId: 'parent-1',
  studentUserId: 'student-1',
  status: 'ACTIVE',
  inviteCodeId: 'invite-1',
  approvedByUserId: 'teacher-1',
  approvedAt: '2026-09-17T01:00:00.000Z',
  revokedByUserId: null,
  revokedAt: null,
  revokeReason: null,
  consentVersion: 'rel-v1',
  consentHash: 'a'.repeat(64),
}

const parentObserver: RelationalApplicabilityV1 = {
  schemaVersion: 1,
  resourceKind: 'BUNDLE',
  resourceKey: 'parent_personality_observer_v1',
  resourceVersion: '1.0.0',
  subjectRoles: ['STUDENT'],
  respondentRoles: ['PARENT'],
  relationshipKinds: ['PARENT_CHILD'],
  perspectives: ['OBSERVER_REPORT'],
  analysisMode: 'INDIVIDUAL_ONLY',
  visibilityPolicyKey: 'observer_private_respondent_v1',
  minimumRespondents: null,
}

const teacherObserver: RelationalApplicabilityV1 = {
  ...parentObserver,
  resourceKey: 'teacher_mental_health_observer_v1',
  respondentRoles: ['TEACHER'],
  relationshipKinds: ['COURSE_TEACHER_STUDENT'],
  visibilityPolicyKey: 'observer_assigning_teacher_v1',
}

const studentExperience: RelationalApplicabilityV1 = {
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

type StudentExperienceFixture = {
  assignment: RelationalAssignmentRecordV1
  result: RelationalCanonicalResultProjectionV1
}

const studentExperienceResult = (index: number, input?: { courseId?: string; episodeId?: string }): StudentExperienceFixture => {
  const respondentUserId = `student-${index + 1}`
  const courseId = input?.courseId ?? 'course-1'
  const assignment = buildRelationalAssignment({
    applicability: studentExperience,
    relationshipSnapshot: resolveCourseTeacherStudentRelationship({
      courseId,
      courseCreatorUserId: 'teacher-1',
      membershipStudentUserId: respondentUserId,
      membershipStatus: 'ACTIVE',
      subjectUserId: 'teacher-1',
      subjectRole: 'TEACHER',
      respondentUserId,
      respondentRole: 'STUDENT',
    }),
    perspective: 'RELATIONAL_EXPERIENCE',
    episodeId: input?.episodeId ?? 'episode-classroom',
    createdByUserId: 'teacher-1',
    consentId: null,
    assignmentId: `a-${courseId}-${index}`,
  })
  return {
    assignment: complete(assignment),
    result: {
      canonicalResultHash: (index + 1).toString(16).padStart(64, '0'),
      metrics: { climate: index + 1 },
    },
  }
}

const createCohortService = (fixtures: StudentExperienceFixture[]) => {
  const assignments = new Map(fixtures.map((entry) => [entry.assignment.assignmentId, entry.assignment]))
  const results = new Map(fixtures.map((entry) => [entry.assignment.assignmentId, entry.result]))
  return createRelationalCohortAnalysisService({
    assignments: { findById: async (id) => assignments.get(id) ?? null },
    canonicalResults: { loadForAssignment: async (assignment) => results.get(assignment.assignmentId) ?? null },
  })
}

const cohortPolicy = (minimumRespondents: number) => ({
  schemaVersion: 1 as const,
  policyKey: 'classroom_environment_cohort_v1',
  policyVersion: '1.0.0',
  minimumRespondents,
  metricKeys: ['climate'],
})

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

describe('RA-01 backend release gate', () => {
  it('Parent -> Student stays an independent observer result', () => {
    const assignment = buildRelationalAssignment({
      applicability: parentObserver,
      relationshipSnapshot: resolveParentChildRelationship({
        relationship: parentRelationship,
        subjectUserId: 'student-1',
        subjectRole: 'STUDENT',
        respondentUserId: 'parent-1',
        respondentRole: 'PARENT',
      }),
      perspective: 'OBSERVER_REPORT',
      episodeId: 'episode-parent',
      createdByUserId: 'parent-1',
      consentId: 'consent-parent',
    })
    expect(assignment.respondentRole).toBe('PARENT')
    expect(projectIndividualRelationalResult({
      assignment,
      viewerUserId: 'parent-1',
      viewerRole: 'PARENT',
      canonicalResultHash: 'a'.repeat(64),
      reportProjection: { personalityProfile: 'descriptive' },
    }).report).toEqual({ personalityProfile: 'descriptive' })
  })

  it('Teacher -> Student uses authoritative course roster relationship', () => {
    const assignment = buildRelationalAssignment({
      applicability: teacherObserver,
      relationshipSnapshot: resolveCourseTeacherStudentRelationship({
        courseId: 'course-1',
        courseCreatorUserId: 'teacher-1',
        membershipStudentUserId: 'student-1',
        membershipStatus: 'ACTIVE',
        subjectUserId: 'student-1',
        subjectRole: 'STUDENT',
        respondentUserId: 'teacher-1',
        respondentRole: 'TEACHER',
      }),
      perspective: 'OBSERVER_REPORT',
      episodeId: 'episode-teacher',
      createdByUserId: 'teacher-1',
      consentId: 'consent-teacher',
    })
    expect(assignment.respondentRole).toBe('TEACHER')
    expect(assignment.relationshipKind).toBe('COURSE_TEACHER_STUDENT')
  })

  it('Student -> Teacher only releases repository-bound minimum-N cohort output', async () => {
    const first = studentExperienceResult(0)
    expect(first.assignment.respondentRole).toBe('STUDENT')
    expect(failCode(() => projectIndividualRelationalResult({
      assignment: first.assignment,
      viewerUserId: 'teacher-1',
      viewerRole: 'TEACHER',
      canonicalResultHash: 'b'.repeat(64),
      reportProjection: { climate: 2 },
    }))).toBe('RELATIONAL_ANALYSIS_ACCESS')

    const results = Array.from({ length: 5 }, (_, index) => studentExperienceResult(index))
    const service = createCohortService(results)
    const cohort = await service.build({
      assignmentIds: results.map((entry) => entry.assignment.assignmentId),
      policy: cohortPolicy(5),
    })
    const projection = projectRelationalCohortForSubject({
      snapshot: cohort,
      viewerUserId: 'teacher-1',
    })
    expect(projection.respondentCount).toBe(5)
    expect(projection.minimumRespondents).toBe(5)
    expect('inputResultHashes' in projection).toBe(false)

    expect(await failCodeAsync(() => createCohortService(results.slice(0, 3)).build({
      assignmentIds: results.slice(0, 3).map((entry) => entry.assignment.assignmentId),
      policy: cohortPolicy(3),
    }))).toBe('RELATIONAL_MINIMUM_N')

    const mixed = [...results.slice(0, 4), studentExperienceResult(5, { courseId: 'course-2' })]
    expect(await failCodeAsync(() => createCohortService(mixed).build({
      assignmentIds: mixed.map((entry) => entry.assignment.assignmentId),
      policy: cohortPolicy(5),
    }))).toBe('RELATIONAL_COHORT_SCOPE')
  })

  it('rejects cross-child and cross-course identity substitution', () => {
    expect(failCode(() => resolveParentChildRelationship({
      relationship: parentRelationship,
      subjectUserId: 'student-2',
      subjectRole: 'STUDENT',
      respondentUserId: 'parent-1',
      respondentRole: 'PARENT',
    }))).toBe('RELATIONAL_PARENT_CHILD_MISMATCH')

    expect(failCode(() => resolveCourseTeacherStudentRelationship({
      courseId: 'course-1',
      courseCreatorUserId: 'teacher-1',
      membershipStudentUserId: 'student-2',
      membershipStatus: 'ACTIVE',
      subjectUserId: 'teacher-1',
      subjectRole: 'TEACHER',
      respondentUserId: 'student-1',
      respondentRole: 'STUDENT',
    }))).toBe('RELATIONAL_COURSE_ROSTER')
  })
})
