import type { RespondentTypeV1 } from '../assessment-identity/types'
import { relationalFail } from './errors'
import type { RelationalAssignmentRecordV1 } from './types'

export interface RelationalAttemptIdentityBindingV1 {
  subjectUserId: string
  respondentUserId: string
  /** Legacy compatibility only. STUDENT-as-other-report remains null and is resolved from assignmentRef. */
  respondentType: RespondentTypeV1 | null
  episodeId: string
  assignmentRef: string
  /** Actual accepted consent row authorizing this attempt; assignment.consentId remains the lineage root. */
  consentId: string | null
}

export const buildRelationalAttemptIdentityBinding = (
  assignment: RelationalAssignmentRecordV1,
  effectiveConsentId: string | null = assignment.consentId,
): RelationalAttemptIdentityBindingV1 => {
  if (assignment.status === 'REVOKED' || assignment.status === 'EXPIRED') {
    relationalFail('RELATIONAL_ASSIGNMENT_INACTIVE', 'inactive assignment cannot bind an attempt')
  }
  if (assignment.consentId && !effectiveConsentId) {
    relationalFail('RELATIONAL_CONSENT_REQUIRED', 'consent-bearing assignment requires an effective accepted consent')
  }
  const respondentType: RespondentTypeV1 | null = assignment.respondentRole === 'PARENT'
    ? 'PARENT'
    : assignment.respondentRole === 'TEACHER'
      ? 'TEACHER'
      : assignment.relationshipKind === 'SELF'
        ? 'SELF'
        : null

  return {
    subjectUserId: assignment.subjectUserId,
    respondentUserId: assignment.respondentUserId,
    respondentType,
    episodeId: assignment.episodeId,
    assignmentRef: assignment.assignmentId,
    consentId: effectiveConsentId,
  }
}

export const assertAssignmentStartable = (input: {
  assignment: RelationalAssignmentRecordV1
  actorUserId: string
  consentAcceptedAt: string | null
}): void => {
  if (input.assignment.respondentUserId !== input.actorUserId) {
    relationalFail('RELATIONAL_ASSIGNMENT_ACTOR', 'only the assigned respondent can start this assessment')
  }
  if (input.assignment.status !== 'OPEN') {
    relationalFail('RELATIONAL_ASSIGNMENT_STATUS', 'only OPEN assignments can be started')
  }
  if (input.assignment.consentId && !input.consentAcceptedAt) {
    relationalFail('RELATIONAL_CONSENT_REQUIRED', 'accepted consent is required before start')
  }
}

export const markRelationalAssignmentStarted = (input: {
  assignment: RelationalAssignmentRecordV1
  actorUserId: string
  consentAcceptedAt: string | null
  startedAt: string
}): RelationalAssignmentRecordV1 => {
  assertAssignmentStartable(input)
  return { ...input.assignment, status: 'STARTED', startedAt: input.startedAt }
}

export const markRelationalAssignmentCompleted = (input: {
  assignment: RelationalAssignmentRecordV1
  completedAt: string
}): RelationalAssignmentRecordV1 => {
  if (input.assignment.status !== 'STARTED') {
    relationalFail('RELATIONAL_ASSIGNMENT_STATUS', 'only STARTED assignments can complete')
  }
  return { ...input.assignment, status: 'COMPLETED', completedAt: input.completedAt }
}

export const markRelationalAssignmentRevoked = (input: {
  assignment: RelationalAssignmentRecordV1
  revokedAt: string
}): RelationalAssignmentRecordV1 => {
  if (input.assignment.status === 'COMPLETED') {
    relationalFail('RELATIONAL_ASSIGNMENT_STATUS', 'completed assignment history cannot be revoked')
  }
  if (input.assignment.status === 'REVOKED') return input.assignment
  return { ...input.assignment, status: 'REVOKED', revokedAt: input.revokedAt }
}
