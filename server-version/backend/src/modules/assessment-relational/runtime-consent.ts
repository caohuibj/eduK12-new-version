import { prisma } from '../../config/database'
import { relationalFail } from './errors'
import {
  createSqlRelationalAssignmentRepository,
  type RelationalAssignmentRepository,
} from './repository'

type RuntimeConsentDb = {
  compositeAssessmentAttempt: {
    findUnique(args: unknown): Promise<{
      userId: string | null
      assignmentRef: string | null
      consentId: string | null
    } | null>
  }
  cognitiveSession: {
    findUnique(args: unknown): Promise<{
      userId: string | null
      compositeAttemptId: string | null
    } | null>
  }
}

export const createRelationalRuntimeConsentAuthority = (input?: {
  db?: RuntimeConsentDb
  assignments?: Pick<RelationalAssignmentRepository, 'findById' | 'resolveAcceptedConsent'>
}) => {
  const db = input?.db ?? (prisma as unknown as RuntimeConsentDb)
  const assignments = input?.assignments
    ?? createSqlRelationalAssignmentRepository(prisma as any)

  const assertCompositeFinal = async (attemptId: string, actorUserId: string): Promise<void> => {
    const attempt = await db.compositeAssessmentAttempt.findUnique({
      where: { id: attemptId },
      select: { userId: true, assignmentRef: true, consentId: true },
    })
    // Let the existing runtime endpoint remain authoritative for missing records.
    if (!attempt || !attempt.assignmentRef) return
    if (attempt.userId !== actorUserId) {
      relationalFail('RELATIONAL_ASSIGNMENT_ACTOR', 'relational runtime FINAL actor is not the attempt respondent')
    }

    const assignment = await assignments.findById(attempt.assignmentRef)
      ?? relationalFail('RELATIONAL_RUNTIME_BINDING', 'relational runtime attempt references a missing assignment')
    if (assignment.respondentUserId !== actorUserId) {
      relationalFail('RELATIONAL_RUNTIME_BINDING', 'relational assignment respondent does not match runtime FINAL actor')
    }
    if (assignment.status === 'OPEN') {
      relationalFail('RELATIONAL_RUNTIME_BINDING', 'relational assignment must be STARTED before FINAL')
    }
    if (assignment.status === 'REVOKED' || assignment.status === 'EXPIRED') {
      relationalFail('RELATIONAL_ASSIGNMENT_ACTOR', 'relational assignment is no longer active')
    }

    // A COMPLETED assignment already has an authoritative historical FINAL.
    // Replay/conflict semantics remain owned by the runtime and must not be
    // rewritten by a later consent revocation.
    if (assignment.status === 'COMPLETED') return

    if (!assignment.consentId) {
      if (attempt.consentId !== null) {
        relationalFail('RELATIONAL_RUNTIME_BINDING', 'consent-free relational assignment has an unexpected runtime consent')
      }
      return
    }
    const resolved = await assignments.resolveAcceptedConsent(assignment)
    if (!resolved) {
      relationalFail('RELATIONAL_CONSENT_REQUIRED', 'accepted consent is required at relational FINAL')
      return
    }
    if (attempt.consentId !== resolved.consentId) {
      relationalFail('RELATIONAL_CONSENT_BINDING', 'runtime FINAL consent does not match the currently authoritative accepted consent')
    }
  }

  return {
    assertCompositeFinal,
    async assertCognitiveFinal(sessionId: string, actorUserId: string): Promise<void> {
      const session = await db.cognitiveSession.findUnique({
        where: { id: sessionId },
        select: { userId: true, compositeAttemptId: true },
      })
      if (!session || !session.compositeAttemptId) return
      if (session.userId !== actorUserId) {
        relationalFail('RELATIONAL_ASSIGNMENT_ACTOR', 'relational cognitive FINAL actor is not the session respondent')
      }
      await assertCompositeFinal(session.compositeAttemptId, actorUserId)
    },
  }
}

export const relationalRuntimeConsentAuthority = createRelationalRuntimeConsentAuthority()
