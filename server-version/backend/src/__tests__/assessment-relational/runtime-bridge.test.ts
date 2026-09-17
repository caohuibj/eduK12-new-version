import { describe, expect, it } from 'vitest'
import * as relationalModule from '../../modules/assessment-relational'
import {
  RelationalAssessmentError,
  createRelationalAssessmentService,
  resolveCourseTeacherStudentRelationship,
  resolveParentChildRelationship,
  type RelationalApplicabilityV1,
  type RelationalAssignmentRecordV1,
  type RelationalAssignmentRepository,
  type RelationalAssignmentStatusV1,
  type ResolvedRelationalConsentV1,
} from '../../modules/assessment-relational'
import type { ParentStudentRelationshipRecordV1 } from '../../modules/assessment-identity/types'

const failCodeAsync = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run()
    throw new Error('expected RelationalAssessmentError')
  } catch (error) {
    if (error instanceof RelationalAssessmentError) return error.code
    throw error
  }
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

class MemoryRepository implements RelationalAssignmentRepository {
  readonly assignments = new Map<string, RelationalAssignmentRecordV1>()
  readonly acceptedByRoot = new Map<string, ResolvedRelationalConsentV1 | null>()

  async create(assignment: RelationalAssignmentRecordV1) {
    this.assignments.set(assignment.assignmentId, assignment)
  }

  async findById(assignmentId: string) {
    return this.assignments.get(assignmentId) ?? null
  }

  async listForRespondent(respondentUserId: string) {
    return [...this.assignments.values()].filter((entry) => entry.respondentUserId === respondentUserId)
  }

  async listForSubject(subjectUserId: string) {
    return [...this.assignments.values()].filter((entry) => entry.subjectUserId === subjectUserId)
  }

  async transition(input: {
    assignmentId: string
    from: RelationalAssignmentStatusV1
    to: RelationalAssignmentStatusV1
    at: string
  }) {
    const current = this.assignments.get(input.assignmentId)
    if (!current || current.status !== input.from) return false
    this.assignments.set(input.assignmentId, {
      ...current,
      status: input.to,
      startedAt: input.to === 'STARTED' ? input.at : current.startedAt,
      completedAt: input.to === 'COMPLETED' ? input.at : current.completedAt,
      revokedAt: input.to === 'REVOKED' ? input.at : current.revokedAt,
    })
    return true
  }

  async resolveAcceptedConsent(assignment: RelationalAssignmentRecordV1) {
    if (!assignment.consentId) return null
    return this.acceptedByRoot.get(assignment.consentId) ?? null
  }
}

const parentRelationship: ParentStudentRelationshipRecordV1 = {
  relationshipId: 'rel-1',
  parentUserId: 'parent-1',
  studentUserId: 'student-1',
  status: 'ACTIVE',
  inviteCodeId: null,
  approvedByUserId: 'teacher-1',
  approvedAt: '2026-09-17T01:00:00.000Z',
  revokedByUserId: null,
  revokedAt: null,
  revokeReason: null,
  consentVersion: 'rel-v1',
  consentHash: 'a'.repeat(64),
}

describe('relational assignment -> unified runtime bridge', () => {
  it('does not expose a public runtime identity binder that can bypass consent resolution', () => {
    expect('buildRelationalAttemptIdentityBinding' in relationalModule).toBe(false)
  })

  it('blocks pending consent and wrong respondent before start', async () => {
    const repo = new MemoryRepository()
    const service = createRelationalAssessmentService(repo)
    const assignment = await service.issue({
      applicability: observerApplicability,
      relationshipSnapshot: resolveParentChildRelationship({
        relationship: parentRelationship,
        subjectUserId: 'student-1',
        subjectRole: 'STUDENT',
        respondentUserId: 'parent-1',
        respondentRole: 'PARENT',
      }),
      perspective: 'OBSERVER_REPORT',
      episodeId: 'episode-1',
      createdByUserId: 'teacher-1',
      consentId: 'consent-root-1',
      assignmentId: 'assignment-1',
    })
    repo.acceptedByRoot.set('consent-root-1', null)
    expect(await failCodeAsync(() => service.start({
      assignmentId: assignment.assignmentId,
      actorUserId: 'parent-1',
    }))).toBe('RELATIONAL_CONSENT_REQUIRED')
    repo.acceptedByRoot.set('consent-root-1', {
      consentId: 'consent-accepted-1',
      acceptedAt: '2026-09-17T02:05:00.000Z',
    })
    expect(await failCodeAsync(() => service.start({
      assignmentId: assignment.assignmentId,
      actorUserId: 'parent-2',
    }))).toBe('RELATIONAL_ASSIGNMENT_ACTOR')
  })

  it('binds the runtime attempt to the accepted descendant while preserving the assignment root consent', async () => {
    const repo = new MemoryRepository()
    const service = createRelationalAssessmentService(repo)
    const assignment = await service.issue({
      applicability: observerApplicability,
      relationshipSnapshot: resolveParentChildRelationship({
        relationship: parentRelationship,
        subjectUserId: 'student-1',
        subjectRole: 'STUDENT',
        respondentUserId: 'parent-1',
        respondentRole: 'PARENT',
      }),
      perspective: 'OBSERVER_REPORT',
      episodeId: 'episode-parent',
      createdByUserId: 'teacher-1',
      consentId: 'consent-pending-a',
      assignmentId: 'assignment-parent',
    })
    repo.acceptedByRoot.set('consent-pending-a', {
      consentId: 'consent-accepted-b',
      acceptedAt: '2026-09-17T02:05:00.000Z',
    })

    const started = await service.start({
      assignmentId: assignment.assignmentId,
      actorUserId: 'parent-1',
      startedAt: '2026-09-17T02:10:00.000Z',
    })
    expect(started.assignment.consentId).toBe('consent-pending-a')
    expect(started.attemptIdentity.consentId).toBe('consent-accepted-b')
    expect(started.attemptIdentity.respondentType).toBe('PARENT')
  })

  it('starts and completes Student -> Teacher without touching scoring/finalization semantics', async () => {
    const repo = new MemoryRepository()
    const service = createRelationalAssessmentService(repo)
    const assignment = await service.issue({
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
      assignmentId: 'assignment-1',
    })
    const started = await service.start({
      assignmentId: assignment.assignmentId,
      actorUserId: 'student-1',
      startedAt: '2026-09-17T02:10:00.000Z',
    })
    expect(started.assignment.status).toBe('STARTED')
    expect(started.attemptIdentity.respondentType).toBeNull()
    expect(started.attemptIdentity.consentId).toBeNull()
    const completed = await service.complete({
      assignmentId: assignment.assignmentId,
      actorUserId: 'student-1',
      completedAt: '2026-09-17T02:20:00.000Z',
    })
    expect(completed.status).toBe('COMPLETED')
  })
})
