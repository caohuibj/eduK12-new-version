import { relationalFail } from './errors'
import type { RelationalAssignmentRecordV1 } from './types'

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
