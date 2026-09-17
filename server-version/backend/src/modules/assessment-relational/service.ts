import { buildRelationalAssignment } from './assignment'
import {
  assertAssignmentStartable,
  buildRelationalAttemptIdentityBinding,
  markRelationalAssignmentCompleted,
  markRelationalAssignmentStarted,
} from './binding'
import { relationalFail } from './errors'
import type { RelationalAssignmentRepository } from './repository'
import type {
  RelationalApplicabilityV1,
  RelationalAssignmentRecordV1,
  RelationalPerspectiveV1,
  RelationalRelationshipSnapshotV1,
} from './types'

export const createRelationalAssessmentService = (repository: RelationalAssignmentRepository) => {
  const requireAssignment = async (assignmentId: string): Promise<RelationalAssignmentRecordV1> => {
    const assignment = await repository.findById(assignmentId)
    if (assignment === null) {
      return relationalFail('RELATIONAL_ASSIGNMENT_NOT_FOUND', 'assignment not found')
    }
    return assignment
  }

  return {
    async issue(input: {
      applicability: RelationalApplicabilityV1
      relationshipSnapshot: RelationalRelationshipSnapshotV1
      perspective: RelationalPerspectiveV1
      episodeId: string
      createdByUserId: string
      consentId: string | null
      assignmentId?: string
      createdAt?: string
    }): Promise<RelationalAssignmentRecordV1> {
      const assignment = buildRelationalAssignment(input)
      await repository.create(assignment)
      return assignment
    },

    async assignedTo(respondentUserId: string): Promise<RelationalAssignmentRecordV1[]> {
      return repository.listForRespondent(respondentUserId)
    },

    async start(input: { assignmentId: string; actorUserId: string; startedAt?: string }) {
      const assignment = await requireAssignment(input.assignmentId)
      const consentAcceptedAt = assignment.consentId
        ? await repository.consentAcceptedAt(assignment.consentId)
        : null
      assertAssignmentStartable({ assignment, actorUserId: input.actorUserId, consentAcceptedAt })
      const startedAt = input.startedAt ?? new Date().toISOString()
      const next = markRelationalAssignmentStarted({
        assignment,
        actorUserId: input.actorUserId,
        consentAcceptedAt,
        startedAt,
      })
      const changed = await repository.transition({
        assignmentId: assignment.assignmentId,
        from: 'OPEN',
        to: 'STARTED',
        at: startedAt,
      })
      if (!changed) relationalFail('RELATIONAL_ASSIGNMENT_CONFLICT', 'assignment state changed concurrently')
      return {
        assignment: next,
        attemptIdentity: buildRelationalAttemptIdentityBinding(next),
      }
    },

    async complete(input: { assignmentId: string; actorUserId: string; completedAt?: string }) {
      const assignment = await requireAssignment(input.assignmentId)
      if (assignment.respondentUserId !== input.actorUserId) {
        relationalFail('RELATIONAL_ASSIGNMENT_ACTOR', 'only the assigned respondent can complete this assessment')
      }
      const completedAt = input.completedAt ?? new Date().toISOString()
      const next = markRelationalAssignmentCompleted({ assignment, completedAt })
      const changed = await repository.transition({
        assignmentId: assignment.assignmentId,
        from: 'STARTED',
        to: 'COMPLETED',
        at: completedAt,
      })
      if (!changed) relationalFail('RELATIONAL_ASSIGNMENT_CONFLICT', 'assignment state changed concurrently')
      return next
    },

    async revoke(input: { assignmentId: string; actorUserId: string; revokedAt?: string }) {
      const assignment = await requireAssignment(input.assignmentId)
      if (assignment.createdByUserId !== input.actorUserId && assignment.respondentUserId !== input.actorUserId) {
        relationalFail('RELATIONAL_ASSIGNMENT_ACTOR', 'only creator or respondent can revoke an open assignment')
      }
      if (assignment.status !== 'OPEN' && assignment.status !== 'STARTED') {
        relationalFail('RELATIONAL_ASSIGNMENT_STATUS', 'only OPEN or STARTED assignment can be revoked')
      }
      const revokedAt = input.revokedAt ?? new Date().toISOString()
      const changed = await repository.transition({
        assignmentId: assignment.assignmentId,
        from: assignment.status,
        to: 'REVOKED',
        at: revokedAt,
      })
      if (!changed) relationalFail('RELATIONAL_ASSIGNMENT_CONFLICT', 'assignment state changed concurrently')
      return { ...assignment, status: 'REVOKED' as const, revokedAt }
    },
  }
}
