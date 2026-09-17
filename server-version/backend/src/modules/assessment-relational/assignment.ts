import { randomUUID } from 'node:crypto'
import type { ObserverAssignmentRecordV1 } from '../assessment-observer/types'
import { assertRelationalApplicabilityMatch } from './contracts'
import { relationalFail } from './errors'
import { hashRelationalRelationshipSnapshot } from './relationship'
import type {
  RelationalApplicabilityV1,
  RelationalAssignmentRecordV1,
  RelationalPerspectiveV1,
  RelationalRelationshipSnapshotV1,
} from './types'

const ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/

const createdAt = (value?: string): string => {
  const resolved = value ?? new Date().toISOString()
  if (!ISO.test(resolved)) relationalFail('RELATIONAL_DATETIME', 'createdAt must be a UTC ISO instant')
  return resolved
}

export const buildRelationalAssignment = (input: {
  applicability: RelationalApplicabilityV1
  relationshipSnapshot: RelationalRelationshipSnapshotV1
  perspective: RelationalPerspectiveV1
  episodeId: string
  createdByUserId: string
  consentId: string | null
  assignmentId?: string
  createdAt?: string
}): RelationalAssignmentRecordV1 => {
  const snapshot = input.relationshipSnapshot
  assertRelationalApplicabilityMatch({
    applicability: input.applicability,
    subjectRole: snapshot.subjectRole,
    respondentRole: snapshot.respondentRole,
    relationshipKind: snapshot.relationshipKind,
    perspective: input.perspective,
  })
  if (snapshot.relationshipKind === 'SELF') {
    if (snapshot.subjectUserId !== snapshot.respondentUserId || snapshot.subjectRole !== snapshot.respondentRole) {
      relationalFail('RELATIONAL_SELF_MISMATCH', 'SELF relationship requires identical subject/respondent identity')
    }
  } else if (snapshot.subjectUserId === snapshot.respondentUserId) {
    relationalFail('RELATIONAL_ACTORS', 'non-SELF assignment requires distinct actors')
  }
  return {
    assignmentId: input.assignmentId ?? randomUUID(),
    episodeId: input.episodeId,
    subjectUserId: snapshot.subjectUserId,
    subjectRole: snapshot.subjectRole,
    respondentUserId: snapshot.respondentUserId,
    respondentRole: snapshot.respondentRole,
    createdByUserId: input.createdByUserId,
    relationshipKind: snapshot.relationshipKind,
    relationshipRef: snapshot.relationshipRef,
    relationshipSnapshot: snapshot,
    relationshipSnapshotHash: hashRelationalRelationshipSnapshot(snapshot),
    perspective: input.perspective,
    resourceKind: input.applicability.resourceKind,
    resourceKey: input.applicability.resourceKey,
    resourceVersion: input.applicability.resourceVersion,
    consentId: input.consentId,
    visibilityPolicyKey: input.applicability.visibilityPolicyKey,
    status: 'OPEN',
    createdAt: createdAt(input.createdAt),
    startedAt: null,
    completedAt: null,
    revokedAt: null,
  }
}

const observerVisibilityPolicy = (visibility: ObserverAssignmentRecordV1['visibility']): string => {
  if (visibility === 'PRIVATE_RESPONDENT') return 'observer_private_respondent_v1'
  if (visibility === 'ASSIGNING_TEACHER') return 'observer_assigning_teacher_v1'
  if (visibility === 'SHARED_COURSE_LEAD') return 'observer_shared_course_lead_v1'
  return relationalFail('RELATIONAL_VISIBILITY', `unsupported observer visibility: ${String(visibility)}`)
}

export const adaptObserverAssignmentToRelational = (input: {
  observer: ObserverAssignmentRecordV1
  relationshipSnapshot: RelationalRelationshipSnapshotV1
}): RelationalAssignmentRecordV1 => {
  const { observer, relationshipSnapshot } = input
  if (
    observer.subjectUserId !== relationshipSnapshot.subjectUserId
    || observer.respondentUserId !== relationshipSnapshot.respondentUserId
  ) {
    relationalFail('RELATIONAL_OBSERVER_MISMATCH', 'observer assignment actors do not match relationship snapshot')
  }
  if (observer.respondentType !== 'PARENT' && observer.respondentType !== 'TEACHER') {
    relationalFail('RELATIONAL_OBSERVER_MISMATCH', 'observer assignment requires PARENT or TEACHER respondentType')
  }
  const expectedRole = observer.respondentType
  if (relationshipSnapshot.subjectRole !== 'STUDENT' || relationshipSnapshot.respondentRole !== expectedRole) {
    relationalFail('RELATIONAL_OBSERVER_MISMATCH', 'observer assignment roles do not match relationship snapshot')
  }
  return {
    assignmentId: observer.assignmentId,
    episodeId: observer.episodeId,
    subjectUserId: observer.subjectUserId,
    subjectRole: 'STUDENT',
    respondentUserId: observer.respondentUserId,
    respondentRole: expectedRole,
    createdByUserId: observer.assignedByUserId,
    relationshipKind: relationshipSnapshot.relationshipKind,
    relationshipRef: relationshipSnapshot.relationshipRef,
    relationshipSnapshot,
    relationshipSnapshotHash: hashRelationalRelationshipSnapshot(relationshipSnapshot),
    perspective: 'OBSERVER_REPORT',
    resourceKind: 'BUNDLE',
    resourceKey: observer.bundleKey,
    resourceVersion: observer.bundleVersion,
    consentId: observer.consentId,
    visibilityPolicyKey: observerVisibilityPolicy(observer.visibility),
    status: observer.status,
    createdAt: observer.createdAt,
    startedAt: null,
    completedAt: null,
    revokedAt: null,
  }
}
