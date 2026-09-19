import { prisma } from '../../config/database'
import { resolveOrganizationAccessContext } from '../organization/access'
import { parseStoredCanonicalUnitResult } from '../assessment-runtime/persistence'
import { reportingFail } from '../reporting/types'
import type { ReportingPrincipal } from '../reporting/authorization'
import { mapSafetyCaseRowToDomain } from './repository'
import { projectSafetyStaffView } from './staff-view'

/** Resolve the existing case through its exact canonical source, never current
 * subject membership or client-supplied Organization attribution. */
export const readOrganizationSafetyCase = async (input: {
  principal: ReportingPrincipal; organizationId: string; caseId: string
}) => {
  const hidden = (): never => reportingFail('REPORT_NOT_FOUND', 'safety resource not found', 404)
  const row = await prisma.safetyCase.findUnique({ where: { id: input.caseId } })
  if (!row || row.subjectUserId === input.principal.userId) return hidden()
  // PR4 enables the existing canonical-unit bridge; other trigger families
  // retain their existing policies rather than guessing a Run association.
  if (row.triggerSourceKind !== 'CANONICAL_UNIT_RESULT' || !row.triggerSourceRecordId) return hidden()
  const snapshot = await prisma.assessmentUnitSnapshot.findUnique({ where: { id: row.triggerSourceRecordId } })
  if (!snapshot?.compositeAttemptId || !snapshot.canonicalResultEncrypted || snapshot.payloadKind !== 'UNIT_RESULT' || snapshot.terminalState !== 'COMPLETED') return hidden()
  const attempt = await prisma.compositeAssessmentAttempt.findUnique({ where: { id: snapshot.compositeAttemptId } })
  if (!attempt || attempt.status !== 'COMPLETED' || attempt.attemptEpoch !== snapshot.attemptEpoch
    || attempt.subjectUserId !== row.subjectUserId) return hidden()
  const canonical = parseStoredCanonicalUnitResult(snapshot.canonicalResultEncrypted)
  if (canonical.resultHash !== row.triggerSourceHash) return hidden()
  const bindings = await prisma.$queryRaw<Array<{ subjectUserId: string }>>`
    SELECT subject.user_id AS "subjectUserId"
    FROM assessment_run_executions e
    JOIN assessment_run_actor_snapshots subject ON subject.id=e.subject_actor_snapshot_id
      AND subject.organization_id=e.organization_id AND subject.run_id=e.run_id
    WHERE e.organization_id=${input.organizationId} AND e.runtime_binding_kind='COMPOSITE'
      AND e.runtime_binding_ref=${snapshot.compositeAttemptId} AND e.status='COMPLETED'
  `
  if (bindings.length !== 1 || bindings[0].subjectUserId !== row.subjectUserId) return hidden()
  const context = await resolveOrganizationAccessContext(input)
  if (!context?.membershipId || context.explicitDenies.some((deny) => ['*', 'SAFETY_READ', 'REPORT_READ'].includes(deny))) return hidden()
  const parent = await prisma.parentStudentRelationship.findFirst({
    where: { parentUserId: input.principal.userId, studentUserId: row.subjectUserId, status: 'ACTIVE' }, select: { id: true },
  })
  if (parent) return hidden()
  const owner = row.primaryOwnerUserId === input.principal.userId || row.backupOwnerUserIds.includes(input.principal.userId)
  if (owner && context.capabilities.includes('PSYCHOLOGY_STAFF')) {
    const events = await prisma.safetyCaseEvent.findMany({ where: { caseId: row.id }, orderBy: { at: 'asc' } })
    return { projection: 'FULL' as const, data: projectSafetyStaffView({
      safetyCase: mapSafetyCaseRowToDomain(row), viewerUserId: input.principal.userId, isAuthorizedAdmin: false,
      events: events.map((event) => ({ eventId: event.id, caseId: event.caseId, type: event.type,
        actorUserId: event.actorUserId, at: event.at.toISOString(), note: event.note, wakeupJobId: event.wakeupJobId })),
    }) }
  }
  if (owner && (context.personas.includes('TEACHER') || context.personas.includes('COUNSELOR'))) {
    return { projection: 'ACTION' as const, data: { caseId: row.id, status: row.status,
      ackDueAt: row.ackDueAt.toISOString(), disposeDueAt: row.disposeDueAt.toISOString(),
      acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null, disposedAt: row.disposedAt?.toISOString() ?? null } }
  }
  // Suspension does not erase an owner's responsibility, but creates no
  // general tenant/Safety bypass for governance viewers.
  if (context.organizationStatus === 'ACTIVE' && context.orgRole === 'ORG_ADMIN') {
    return { projection: 'SUMMARY' as const, data: { caseId: row.id, status: row.status,
      createdAt: row.createdAt.toISOString(), disposedAt: row.disposedAt?.toISOString() ?? null } }
  }
  return hidden()
}
