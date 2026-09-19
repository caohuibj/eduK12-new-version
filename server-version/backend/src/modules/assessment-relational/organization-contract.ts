import { relationalFail } from './errors'
import type {
  RelationalActorRoleV1,
  RelationalRelationshipKindV1,
  RelationalRelationshipSnapshotV1,
} from './types'

const pair = (a: RelationalActorRoleV1, b: RelationalActorRoleV1) => new Set([a, b])

/**
 * Validate relationship semantics that are independent from legacy User.role.
 * Organization Run callers must supply roles already frozen from Persona/relationship authority.
 */
export const validateOrganizationRelationalSnapshot = (
  snapshot: RelationalRelationshipSnapshotV1,
): RelationalRelationshipSnapshotV1 => {
  if (snapshot.schemaVersion !== 1) relationalFail('RELATIONAL_RELATIONSHIP_SNAPSHOT', 'schemaVersion must be 1')
  const kind: RelationalRelationshipKindV1 = snapshot.relationshipKind
  if (kind === 'SELF') {
    if (
      snapshot.subjectUserId !== snapshot.respondentUserId
      || snapshot.subjectRole !== snapshot.respondentRole
      || snapshot.relationshipRef !== null
    ) {
      relationalFail('RELATIONAL_SELF_MISMATCH', 'SELF requires identical frozen actor identity and no relationshipRef')
    }
    return snapshot
  }
  if (snapshot.subjectUserId === snapshot.respondentUserId) {
    relationalFail('RELATIONAL_ACTORS', 'non-SELF relationship requires distinct users')
  }
  if (!snapshot.relationshipRef) {
    relationalFail('RELATIONAL_RELATIONSHIP_REF', `${kind} requires frozen relationshipRef`)
  }
  const roles = pair(snapshot.subjectRole, snapshot.respondentRole)
  if (kind === 'PARENT_CHILD') {
    if (!(roles.has('PARENT') && roles.has('STUDENT'))) relationalFail('RELATIONAL_RELATIONSHIP_ROLE', 'PARENT_CHILD requires PARENT + STUDENT')
  } else if (kind === 'CLASS_TEACHER_STUDENT' || kind === 'COURSE_TEACHER_STUDENT') {
    if (!(roles.has('TEACHER') && roles.has('STUDENT'))) relationalFail('RELATIONAL_RELATIONSHIP_ROLE', `${kind} requires TEACHER + STUDENT`)
  } else if (kind === 'COUNSELOR_CLIENT') {
    if (!(roles.has('COUNSELOR') && roles.has('CLIENT'))) relationalFail('RELATIONAL_RELATIONSHIP_ROLE', 'COUNSELOR_CLIENT requires COUNSELOR + CLIENT')
  }
  if (kind !== 'COURSE_TEACHER_STUDENT' && snapshot.courseId !== null) {
    relationalFail('RELATIONAL_COURSE_SCOPE', 'Organization relationship must not fabricate courseId')
  }
  return snapshot
}
