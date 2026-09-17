import { canonicalHash } from '../assessment-runtime/canonical'
import type { ParentStudentRelationshipRecordV1 } from '../assessment-identity/types'
import { relationalFail } from './errors'
import type {
  RelationalActorRoleV1,
  RelationalRelationshipSnapshotV1,
} from './types'

const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/

const verifiedAt = (value?: string): string => {
  const resolved = value ?? new Date().toISOString()
  if (!ISO.test(resolved)) relationalFail('RELATIONAL_DATETIME', 'verifiedAt must be a UTC ISO instant')
  return resolved
}

const assertDistinctActors = (subjectUserId: string, respondentUserId: string): void => {
  if (subjectUserId === respondentUserId) {
    relationalFail('RELATIONAL_ACTORS', 'non-SELF relationship requires distinct subject and respondent')
  }
}

export const hashRelationalRelationshipSnapshot = (snapshot: RelationalRelationshipSnapshotV1): string => (
  canonicalHash({ schema: 'RelationalRelationshipSnapshotV1', snapshot })
)

export const resolveParentChildRelationship = (input: {
  relationship: ParentStudentRelationshipRecordV1
  subjectUserId: string
  subjectRole: RelationalActorRoleV1
  respondentUserId: string
  respondentRole: RelationalActorRoleV1
  verifiedAt?: string
}): RelationalRelationshipSnapshotV1 => {
  assertDistinctActors(input.subjectUserId, input.respondentUserId)
  if (input.relationship.status !== 'ACTIVE') {
    relationalFail('RELATIONAL_PARENT_CHILD_INACTIVE', 'parent-child relationship must be ACTIVE')
  }
  const pair = new Set([input.subjectRole, input.respondentRole])
  if (pair.size !== 2 || !pair.has('PARENT') || !pair.has('STUDENT')) {
    relationalFail('RELATIONAL_PARENT_CHILD_ROLES', 'PARENT_CHILD requires one PARENT and one STUDENT')
  }
  const parentUserId = input.subjectRole === 'PARENT' ? input.subjectUserId : input.respondentUserId
  const studentUserId = input.subjectRole === 'STUDENT' ? input.subjectUserId : input.respondentUserId
  if (
    input.relationship.parentUserId !== parentUserId
    || input.relationship.studentUserId !== studentUserId
  ) {
    relationalFail('RELATIONAL_PARENT_CHILD_MISMATCH', 'actors do not match the ACTIVE parent-child relationship')
  }
  return {
    schemaVersion: 1,
    relationshipKind: 'PARENT_CHILD',
    relationshipRef: input.relationship.relationshipId,
    subjectUserId: input.subjectUserId,
    subjectRole: input.subjectRole,
    respondentUserId: input.respondentUserId,
    respondentRole: input.respondentRole,
    courseId: null,
    verifiedAt: verifiedAt(input.verifiedAt),
    facts: {
      active: true,
      consentVersion: input.relationship.consentVersion,
    },
  }
}

export const resolveCourseTeacherStudentRelationship = (input: {
  courseId: string
  courseCreatorUserId: string
  membershipStudentUserId: string
  membershipStatus: 'PENDING' | 'APPROVED' | 'ACTIVE'
  subjectUserId: string
  subjectRole: RelationalActorRoleV1
  respondentUserId: string
  respondentRole: RelationalActorRoleV1
  verifiedAt?: string
}): RelationalRelationshipSnapshotV1 => {
  assertDistinctActors(input.subjectUserId, input.respondentUserId)
  const pair = new Set([input.subjectRole, input.respondentRole])
  if (pair.size !== 2 || !pair.has('TEACHER') || !pair.has('STUDENT')) {
    relationalFail('RELATIONAL_COURSE_ROLES', 'COURSE_TEACHER_STUDENT requires one TEACHER and one STUDENT')
  }
  if (input.membershipStatus !== 'ACTIVE' && input.membershipStatus !== 'APPROVED') {
    relationalFail('RELATIONAL_COURSE_ROSTER', 'student must have ACTIVE or APPROVED course membership')
  }
  const teacherUserId = input.subjectRole === 'TEACHER' ? input.subjectUserId : input.respondentUserId
  const studentUserId = input.subjectRole === 'STUDENT' ? input.subjectUserId : input.respondentUserId
  if (teacherUserId !== input.courseCreatorUserId) {
    relationalFail('RELATIONAL_COURSE_TEACHER', 'teacher actor must be the course creator')
  }
  if (studentUserId !== input.membershipStudentUserId) {
    relationalFail('RELATIONAL_COURSE_ROSTER', 'student actor does not match course membership')
  }
  return {
    schemaVersion: 1,
    relationshipKind: 'COURSE_TEACHER_STUDENT',
    relationshipRef: input.courseId,
    subjectUserId: input.subjectUserId,
    subjectRole: input.subjectRole,
    respondentUserId: input.respondentUserId,
    respondentRole: input.respondentRole,
    courseId: input.courseId,
    verifiedAt: verifiedAt(input.verifiedAt),
    facts: {
      teacherIsCourseCreator: true,
      membershipStatus: input.membershipStatus,
    },
  }
}

export const resolveSelfRelationship = (input: {
  userId: string
  role: RelationalActorRoleV1
  verifiedAt?: string
}): RelationalRelationshipSnapshotV1 => ({
  schemaVersion: 1,
  relationshipKind: 'SELF',
  relationshipRef: null,
  subjectUserId: input.userId,
  subjectRole: input.role,
  respondentUserId: input.userId,
  respondentRole: input.role,
  courseId: null,
  verifiedAt: verifiedAt(input.verifiedAt),
  facts: { self: true },
})
