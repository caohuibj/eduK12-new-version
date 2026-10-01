import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { createAttemptConsent, acceptPendingAttemptConsent } from '../assessment-identity/identity'
import type { AssessmentAttemptConsentRecordV1 } from '../assessment-identity/types'
import { createSqlRelationalAssignmentRepository } from '../assessment-relational/repository'
import { lockExecutionEnvelope } from './startClaim'
import { assertCurrentRunStartAuthority } from './startAuthority'
import { RunStartAdmissionError } from './startAdmission'

type Tx = Prisma.TransactionClient
const scopes: Record<string, string> = {
  observer_private_respondent_v1: 'PRIVATE_RESPONDENT',
  observer_assigning_teacher_v1: 'ASSIGNING_TEACHER',
  observer_shared_course_lead_v1: 'SHARED_COURSE_LEAD',
}

export const createRunPendingConsent = async (tx: Tx, input: {
  subjectUserId: string; respondentUserId: string; respondentRole: string; createdByUserId: string; perspective?: string
  visibilityPolicyKey: string; resourceKind: string; resourceKey: string; resourceVersion: string
}): Promise<string | null> => {
  const scope = scopes[input.visibilityPolicyKey]
  if (!scope && input.perspective === 'SELF_REPORT' && input.subjectUserId === input.respondentUserId) return null
  if (!scope && input.respondentRole !== 'PARENT') return null
  if (!scope || !['PARENT', 'TEACHER'].includes(input.respondentRole)) {
    throw new RunStartAdmissionError('RUN_CONSENT_POLICY_UNSUPPORTED', 'Run observer consent policy is unsupported')
  }
  const consent = createAttemptConsent({
    subjectUserId: input.subjectUserId, respondentUserId: input.respondentUserId,
    respondentType: input.respondentRole as 'PARENT' | 'TEACHER',
    consentVersion: 'organization-run-observer-v1',
    purpose: `organization_run:${input.resourceKind}:${input.resourceKey}:${input.resourceVersion}`,
    visibilityScope: scope, shareTargets: scope === 'PRIVATE_RESPONDENT' ? [] : [input.createdByUserId],
    pending: true, acceptedAt: null,
  })
  await tx.assessmentAttemptConsent.create({ data: {
    id: consent.consentId, priorConsentId: null, subjectUserId: consent.subjectUserId,
    respondentUserId: consent.respondentUserId, respondentType: consent.respondentType,
    consentVersion: consent.consentVersion, consentHash: consent.consentHash,
    purpose: consent.purpose, visibilityScope: consent.visibilityScope,
    shareTargetsJson: consent.shareTargets, acceptedAt: null, revokedAt: null,
  } })
  return consent.consentId
}

export const acceptRunExecutionConsent = async (input: { executionId: string; actorUserId: string }) => (
  prisma.$transaction(async (tx) => {
    const envelope = await lockExecutionEnvelope(tx, input.executionId)
    if (envelope.respondentUserId !== input.actorUserId) throw new RunStartAdmissionError('RUN_EXECUTION_ACTOR', 'only the assigned respondent may accept consent', 403)
    await assertCurrentRunStartAuthority(tx, input.executionId)
    const rows = await tx.$queryRaw<Array<{ assignmentId: string }>>`
      SELECT e."relational_assignment_id" AS "assignmentId" FROM "assessment_run_executions" e
      JOIN "assessment_runs" r ON r."id" = e."run_id"
      WHERE e."id" = ${input.executionId} AND e."status" = 'ASSIGNED' AND r."status" = 'PUBLISHED'
    `
    if (!rows[0]) throw new RunStartAdmissionError('RUN_NOT_STARTABLE', 'Run is not open for consent acceptance')
    const repository = createSqlRelationalAssignmentRepository(tx as any)
    const assignment = await repository.findById(rows[0].assignmentId)
    if (!assignment || assignment.policyDomain !== 'ORGANIZATION_RUN' || !assignment.consentId) {
      throw new RunStartAdmissionError('RUN_CONSENT_REQUIRED', 'Run assignment has no consent lineage')
    }
    if (await repository.resolveAcceptedConsent(assignment)) return { accepted: true, replayed: true }
    const root = await tx.assessmentAttemptConsent.findUnique({ where: { id: assignment.consentId } })
    if (!root || root.priorConsentId || root.acceptedAt || root.revokedAt) {
      throw new RunStartAdmissionError('RUN_CONSENT_REQUIRED', 'active pending consent root is required')
    }
    const pending: AssessmentAttemptConsentRecordV1 = {
      consentId: root.id, priorConsentId: null, subjectUserId: root.subjectUserId,
      respondentUserId: root.respondentUserId, respondentType: root.respondentType as 'PARENT' | 'TEACHER',
      consentVersion: root.consentVersion, consentHash: root.consentHash, purpose: root.purpose,
      visibilityScope: root.visibilityScope, shareTargets: root.shareTargetsJson as string[], acceptedAt: null, revokedAt: null,
    }
    const accepted = acceptPendingAttemptConsent({ pending })
    await tx.assessmentAttemptConsent.create({ data: {
      id: accepted.consentId, priorConsentId: root.id, subjectUserId: accepted.subjectUserId,
      respondentUserId: accepted.respondentUserId, respondentType: accepted.respondentType,
      consentVersion: accepted.consentVersion, consentHash: accepted.consentHash, purpose: accepted.purpose,
      visibilityScope: accepted.visibilityScope, shareTargetsJson: accepted.shareTargets,
      acceptedAt: new Date(accepted.acceptedAt!), revokedAt: null,
    } })
    if (!await repository.resolveAcceptedConsent(assignment)) throw new RunStartAdmissionError('RUN_CONSENT_REQUIRED', 'accepted consent could not be resolved')
    await tx.$executeRaw`
      INSERT INTO "organization_governance_audits"
        ("id", "organization_id", "actor_user_id", "action", "target_type", "target_id", "domain_event_id", "payload")
      VALUES (${accepted.consentId}, ${envelope.organizationId}, ${input.actorUserId}, 'ASSESSMENT_RUN_CONSENT_ACCEPTED',
        'AssessmentRunExecution', ${input.executionId}, ${accepted.consentId},
        ${JSON.stringify({ assignmentId: assignment.assignmentId, consentId: accepted.consentId })}::jsonb)
    `
    return { accepted: true, replayed: false }
  })
)
