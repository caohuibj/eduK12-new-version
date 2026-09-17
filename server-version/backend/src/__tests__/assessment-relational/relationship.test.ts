import { describe, expect, it } from 'vitest'
import type { ParentStudentRelationshipRecordV1 } from '../../modules/assessment-identity/types'
import type { ObserverAssignmentRecordV1 } from '../../modules/assessment-observer/types'
import {
  RelationalAssessmentError,
  adaptObserverAssignmentToRelational,
  hashRelationalRelationshipSnapshot,
  resolveCourseTeacherStudentRelationship,
  resolveParentChildRelationship,
  type RelationalApplicabilityV1,
} from '../../modules/assessment-relational'

const failCode = (run: () => unknown): string => {
  try {
    run()
    throw new Error('expected RelationalAssessmentError')
  } catch (error) {
    if (error instanceof RelationalAssessmentError) return error.code
    throw error
  }
}

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
  consentVersion: 'parent-rel-v1',
  consentHash: 'a'.repeat(64),
}

const parentObserverApplicability: RelationalApplicabilityV1 = {
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

describe('relational relationship resolvers', () => {
  it('freezes active Parent -> Student relationship provenance', () => {
    const snapshot = resolveParentChildRelationship({
      relationship: parentRelationship,
      subjectUserId: 'student-1',
      subjectRole: 'STUDENT',
      respondentUserId: 'parent-1',
      respondentRole: 'PARENT',
      verifiedAt: '2026-09-17T02:00:00.000Z',
    })
    expect(snapshot.relationshipRef).toBe('rel-1')
    expect(snapshot.facts.active).toBe(true)
    expect(hashRelationalRelationshipSnapshot(snapshot)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects revoked parent relationship', () => {
    expect(failCode(() => resolveParentChildRelationship({
      relationship: { ...parentRelationship, status: 'REVOKED' },
      subjectUserId: 'student-1',
      subjectRole: 'STUDENT',
      respondentUserId: 'parent-1',
      respondentRole: 'PARENT',
    }))).toBe('RELATIONAL_PARENT_CHILD_INACTIVE')
  })

  it('supports Teacher -> Student and Student -> Teacher through the same course resolver', () => {
    const teacherToStudent = resolveCourseTeacherStudentRelationship({
      courseId: 'course-1',
      courseCreatorUserId: 'teacher-1',
      membershipStudentUserId: 'student-1',
      membershipStatus: 'ACTIVE',
      subjectUserId: 'student-1',
      subjectRole: 'STUDENT',
      respondentUserId: 'teacher-1',
      respondentRole: 'TEACHER',
      verifiedAt: '2026-09-17T02:00:00.000Z',
    })
    const studentToTeacher = resolveCourseTeacherStudentRelationship({
      courseId: 'course-1',
      courseCreatorUserId: 'teacher-1',
      membershipStudentUserId: 'student-1',
      membershipStatus: 'APPROVED',
      subjectUserId: 'teacher-1',
      subjectRole: 'TEACHER',
      respondentUserId: 'student-1',
      respondentRole: 'STUDENT',
      verifiedAt: '2026-09-17T02:00:00.000Z',
    })
    expect(teacherToStudent.relationshipRef).toBe('course-1')
    expect(studentToTeacher.relationshipRef).toBe('course-1')
    expect(studentToTeacher.respondentRole).toBe('STUDENT')
  })

  it('does not treat pending membership or shared-course access as roster authority', () => {
    expect(failCode(() => resolveCourseTeacherStudentRelationship({
      courseId: 'course-1',
      courseCreatorUserId: 'teacher-1',
      membershipStudentUserId: 'student-1',
      membershipStatus: 'PENDING',
      subjectUserId: 'teacher-1',
      subjectRole: 'TEACHER',
      respondentUserId: 'student-1',
      respondentRole: 'STUDENT',
    }))).toBe('RELATIONAL_COURSE_ROSTER')

    expect(failCode(() => resolveCourseTeacherStudentRelationship({
      courseId: 'course-1',
      courseCreatorUserId: 'course-share-recipient',
      membershipStudentUserId: 'student-1',
      membershipStatus: 'ACTIVE',
      subjectUserId: 'teacher-1',
      subjectRole: 'TEACHER',
      respondentUserId: 'student-1',
      respondentRole: 'STUDENT',
    }))).toBe('RELATIONAL_COURSE_TEACHER')
  })

  it('adapts existing observer assignment without changing its identity', () => {
    const relationshipSnapshot = resolveParentChildRelationship({
      relationship: parentRelationship,
      subjectUserId: 'student-1',
      subjectRole: 'STUDENT',
      respondentUserId: 'parent-1',
      respondentRole: 'PARENT',
      verifiedAt: '2026-09-17T02:00:00.000Z',
    })
    const observer: ObserverAssignmentRecordV1 = {
      assignmentId: 'observer-assignment-1',
      path: 'TEACHER_ASSIGN_PARENT',
      bundleKey: 'sdq_parent_observer_zh_cn_v1',
      bundleVersion: '1.0.0',
      episodeId: 'episode-1',
      subjectUserId: 'student-1',
      respondentUserId: 'parent-1',
      respondentType: 'PARENT',
      assignedByUserId: 'teacher-1',
      courseId: 'course-1',
      visibility: 'ASSIGNING_TEACHER',
      shareTargets: ['teacher-1'],
      consentId: 'consent-1',
      createdAt: '2026-09-17T02:00:00.000Z',
      status: 'OPEN',
    }
    const relational = adaptObserverAssignmentToRelational({
      observer,
      relationshipSnapshot,
      applicability: parentObserverApplicability,
    })
    expect(relational.assignmentId).toBe(observer.assignmentId)
    expect(relational.resourceKey).toBe(observer.bundleKey)
    expect(relational.perspective).toBe('OBSERVER_REPORT')
    expect(relational.visibilityPolicyKey).toBe('observer_assigning_teacher_v1')
    expect(relational.analysisMode).toBe('INDIVIDUAL_ONLY')
    expect(relational.minimumRespondents).toBeNull()
  })
})
