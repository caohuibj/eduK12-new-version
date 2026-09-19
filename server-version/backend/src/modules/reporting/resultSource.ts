import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { parseStoredCanonicalUnitResult } from '../assessment-runtime/persistence'
import {
  ReportingError,
  reportingFail,
  type ReportingCohortSnapshotRecord,
  type ReportingProvenanceState,
  type ReportingResolvedExecutionV1,
  type ReportingResolvedMetricV1,
  type ReportingResourceFamily,
  type ReportingResultBatchV1,
  type ReportingResultQuality,
  type ReportingUnresolvedExecutionV1,
} from './types'

type Tx = Prisma.TransactionClient

export type ReportingObservationActorRoleV1 = 'TEACHER' | 'STUDENT' | 'COUNSELOR' | 'CLIENT' | 'PARENT'
export type ReportingObservationPerspectiveV1 = 'SELF_REPORT' | 'OBSERVER_REPORT' | 'RELATIONAL_EXPERIENCE'

export interface ReportingObservationActorV1 {
  userId: string
  membershipId: string | null
  actorRole: ReportingObservationActorRoleV1
  provenanceKind: 'ORG_MEMBER' | 'EXTERNAL_PARENT'
  externalRelationshipRef: string | null
}

export interface ReportingResolvedObservationV1 {
  executionId: string
  trackId: string
  subject: ReportingObservationActorV1
  respondent: ReportingObservationActorV1
  relationshipKind: string
  relationshipRef: string | null
  perspective: ReportingObservationPerspectiveV1
  policyDomain: 'ORGANIZATION_RUN'
  canonicalResultHash: string
  metrics: ReportingResolvedMetricV1[]
  scientificMaturity: 'PILOT' | 'RESEARCH_READY' | 'RESEARCH_GRADE' | null
  provenanceState: ReportingProvenanceState
  scientificProvenanceHash: string | null
}

export interface ReportingUnresolvedObservationV1 {
  executionId: string
  trackId: string
  subject: ReportingObservationActorV1
  respondent: ReportingObservationActorV1
  relationshipKind: string
  relationshipRef: string | null
  perspective: ReportingObservationPerspectiveV1
  policyDomain: 'ORGANIZATION_RUN'
  reason: 'NOT_COMPLETED'
}

export interface ReportingObservationBatchV1 {
  organizationId: string
  runId: string
  trackId: string
  resourceFamily: ReportingResourceFamily
  resourceKey: string
  resourceVersion: string
  resourceMinimumN: number | null
  resolved: ReportingResolvedObservationV1[]
  unresolved: ReportingUnresolvedObservationV1[]
}

type ExecutionRow = {
  executionId: string
  executionStatus: string
  trackId: string
  assignmentId: string | null
  runtimeBindingKind: string | null
  runtimeBindingRef: string | null
  subjectUserId: string
  subjectMembershipId: string | null
  subjectActorRole: string
  subjectProvenanceKind: string
  subjectExternalRelationshipRef: string | null
  respondentUserId: string
  respondentMembershipId: string | null
  respondentActorRole: string
  respondentProvenanceKind: string
  respondentExternalRelationshipRef: string | null
  relationshipKind: string
  relationshipRef: string | null
  perspective: string | null
  policyDomain: string | null
  resourceFamily: string
  resourceKey: string
  resourceVersion: string
  requestedPolicy: Record<string, unknown> | null
  frozenResourcePolicy: Record<string, unknown> | null
  scientificMaturity: 'PILOT' | 'RESEARCH_READY' | 'RESEARCH_GRADE' | null
  scientificProvenanceHash: string | null
}

const asQuality = (value: string): ReportingResultQuality => {
  if (value === 'interpretable' || value === 'limited' || value === 'invalid') return value
  return reportingFail('REPORT_RESULT_INTEGRITY', 'canonical result has unknown quality state', 500)
}

const positiveMinimum = (value: unknown): number | null => (
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
)

const asActorRole = (value: string): ReportingObservationActorRoleV1 => {
  if (['TEACHER', 'STUDENT', 'COUNSELOR', 'CLIENT', 'PARENT'].includes(value)) return value as ReportingObservationActorRoleV1
  return reportingFail('REPORT_RESULT_INTEGRITY', 'Run actor has unsupported role', 500)
}

const asPerspective = (value: string | null): ReportingObservationPerspectiveV1 => {
  if (value === 'SELF_REPORT' || value === 'OBSERVER_REPORT' || value === 'RELATIONAL_EXPERIENCE') return value
  return reportingFail('REPORT_RESULT_INTEGRITY', 'Run observation is missing a valid perspective', 500)
}

const actorFromRow = (row: ExecutionRow, which: 'subject' | 'respondent'): ReportingObservationActorV1 => {
  const prefix = which === 'subject' ? 'subject' : 'respondent'
  const userId = prefix === 'subject' ? row.subjectUserId : row.respondentUserId
  const membershipId = prefix === 'subject' ? row.subjectMembershipId : row.respondentMembershipId
  const actorRole = prefix === 'subject' ? row.subjectActorRole : row.respondentActorRole
  const provenanceKind = prefix === 'subject' ? row.subjectProvenanceKind : row.respondentProvenanceKind
  const externalRelationshipRef = prefix === 'subject' ? row.subjectExternalRelationshipRef : row.respondentExternalRelationshipRef
  if (provenanceKind !== 'ORG_MEMBER' && provenanceKind !== 'EXTERNAL_PARENT') {
    return reportingFail('REPORT_RESULT_INTEGRITY', 'Run actor has unsupported provenance', 500)
  }
  if (provenanceKind === 'ORG_MEMBER' && !membershipId) reportingFail('REPORT_RESULT_INTEGRITY', 'Organization actor is missing Membership provenance', 500)
  if (provenanceKind === 'EXTERNAL_PARENT' && (membershipId || !externalRelationshipRef)) {
    reportingFail('REPORT_RESULT_INTEGRITY', 'external Parent actor provenance is invalid', 500)
  }
  return { userId, membershipId, actorRole: asActorRole(actorRole), provenanceKind, externalRelationshipRef }
}

const queryTrackRows = async (tx: Tx, input: { organizationId: string; runId: string; trackId: string }): Promise<ExecutionRow[]> => tx.$queryRaw<ExecutionRow[]>`
  SELECT e."id" AS "executionId", e."status" AS "executionStatus", e."track_id" AS "trackId",
    e."relational_assignment_id" AS "assignmentId", e."runtime_binding_kind" AS "runtimeBindingKind", e."runtime_binding_ref" AS "runtimeBindingRef",
    subject."user_id" AS "subjectUserId", subject."membership_id" AS "subjectMembershipId", subject."actor_role" AS "subjectActorRole",
    subject."provenance_kind" AS "subjectProvenanceKind", subject."external_relationship_ref" AS "subjectExternalRelationshipRef",
    respondent."user_id" AS "respondentUserId", respondent."membership_id" AS "respondentMembershipId", respondent."actor_role" AS "respondentActorRole",
    respondent."provenance_kind" AS "respondentProvenanceKind", respondent."external_relationship_ref" AS "respondentExternalRelationshipRef",
    relationship."relationship_kind" AS "relationshipKind", relationship."relationship_ref" AS "relationshipRef",
    COALESCE(assignment."perspective", t."requested_policy"->'perspectives'->>0) AS "perspective",
    COALESCE(assignment."policy_domain", 'ORGANIZATION_RUN') AS "policyDomain",
    t."resource_family" AS "resourceFamily", t."resource_key" AS "resourceKey", t."resource_version" AS "resourceVersion",
    t."requested_policy" AS "requestedPolicy", t."frozen_resource_policy" AS "frozenResourcePolicy",
    e."scientific_maturity" AS "scientificMaturity", e."scientific_provenance_hash" AS "scientificProvenanceHash"
  FROM "assessment_run_executions" e
  JOIN "assessment_run_tracks" t ON t."organization_id"=e."organization_id" AND t."run_id"=e."run_id" AND t."id"=e."track_id"
  JOIN "assessment_run_actor_snapshots" subject ON subject."organization_id"=e."organization_id" AND subject."run_id"=e."run_id" AND subject."id"=e."subject_actor_snapshot_id"
  JOIN "assessment_run_actor_snapshots" respondent ON respondent."organization_id"=e."organization_id" AND respondent."run_id"=e."run_id" AND respondent."id"=e."respondent_actor_snapshot_id"
  JOIN "assessment_run_relationship_snapshots" relationship ON relationship."organization_id"=e."organization_id" AND relationship."run_id"=e."run_id" AND relationship."id"=e."relationship_snapshot_id"
  LEFT JOIN "relational_assessment_assignments" assignment ON assignment."id"=e."relational_assignment_id"
  WHERE e."organization_id"=${input.organizationId} AND e."run_id"=${input.runId} AND e."track_id"=${input.trackId}
  ORDER BY e."id"
`

const resolveTrackInTransaction = async (
  tx: Tx,
  input: { organizationId: string; runId: string; trackId: string },
): Promise<ReportingObservationBatchV1> => {
  const executions = await queryTrackRows(tx, input)
  const first = executions[0]
  if (!first) reportingFail('REPORT_COHORT_EMPTY', 'reporting Track has no executions', 409)
  if (!['BUNDLE', 'SCALE', 'COGNITIVE', 'SITUATIONAL'].includes(first.resourceFamily)) {
    reportingFail('REPORT_ANALYSIS_KIND_UNSUPPORTED', 'resource family has no enabled authoritative reporting adapter', 409)
  }
  if (executions.some((row) => row.resourceFamily !== first.resourceFamily || row.resourceKey !== first.resourceKey || row.resourceVersion !== first.resourceVersion)) {
    reportingFail('REPORT_RESULT_INTEGRITY', 'Run Track contains mixed resource identities', 500)
  }
  if (executions.some((row) => row.policyDomain !== 'ORGANIZATION_RUN')) {
    reportingFail('REPORT_RESULT_INTEGRITY', 'Organization Run observation has invalid assignment policy provenance', 500)
  }
  const resourceMinimumN = positiveMinimum(first.frozenResourcePolicy?.minimumRespondents)
  const trackMinimumN = positiveMinimum(first.requestedPolicy?.minimumRespondents)
  const effectiveMinimumN = Math.max(resourceMinimumN ?? 0, trackMinimumN ?? 0) || null

  const unresolved: ReportingUnresolvedObservationV1[] = executions
    .filter((row) => row.executionStatus !== 'COMPLETED')
    .map((row) => ({
      executionId: row.executionId,
      trackId: row.trackId,
      subject: actorFromRow(row, 'subject'),
      respondent: actorFromRow(row, 'respondent'),
      relationshipKind: row.relationshipKind,
      relationshipRef: row.relationshipRef,
      perspective: asPerspective(row.perspective),
      policyDomain: 'ORGANIZATION_RUN',
      reason: 'NOT_COMPLETED',
    }))

  const completed = executions.filter((row) => row.executionStatus === 'COMPLETED')
  if (completed.some((row) => !row.runtimeBindingRef || !row.runtimeBindingKind)) {
    reportingFail('REPORT_RESULT_INTEGRITY', 'completed Run execution is missing runtime binding', 500)
  }
  if (completed.some((row) => row.runtimeBindingKind !== 'COMPOSITE')) {
    reportingFail('REPORT_RESULT_SOURCE_UNSUPPORTED', 'completed Run runtime has no authoritative reporting adapter', 409)
  }

  const attemptIds = completed.map((row) => row.runtimeBindingRef!)
  const attempts = attemptIds.length === 0 ? [] : await tx.compositeAssessmentAttempt.findMany({
    where: { id: { in: attemptIds } },
    select: {
      id: true,
      status: true,
      userId: true,
      subjectUserId: true,
      respondentUserId: true,
      assignmentRef: true,
      attemptEpoch: true,
    },
  })
  const attemptById = new Map(attempts.map((attempt) => [attempt.id, attempt]))
  for (const row of completed) {
    const attempt = attemptById.get(row.runtimeBindingRef!)
    if (!attempt) throw new ReportingError('REPORT_RESULT_INTEGRITY', 'completed Run execution has no authoritative runtime result', 500)
    if (attempt.status !== 'COMPLETED') reportingFail('REPORT_RESULT_INTEGRITY', 'completed Run execution has no completed authoritative runtime result', 500)
    if (
      attempt.userId !== row.respondentUserId
      || attempt.subjectUserId !== row.subjectUserId
      || attempt.respondentUserId !== row.respondentUserId
      || attempt.assignmentRef !== row.assignmentId
    ) reportingFail('REPORT_RESULT_INTEGRITY', 'runtime result identity does not match Run execution', 500)
  }

  const snapshots = attemptIds.length === 0 ? [] : await tx.assessmentUnitSnapshot.findMany({
    where: { compositeAttemptId: { in: attemptIds }, terminalState: 'COMPLETED', payloadKind: 'UNIT_RESULT' },
    orderBy: [{ compositeAttemptId: 'asc' }, { slotKey: 'asc' }],
    select: { compositeAttemptId: true, attemptEpoch: true, slotKey: true, canonicalResultEncrypted: true },
  })
  const snapshotsByAttempt = new Map<string, typeof snapshots>()
  for (const snapshot of snapshots) {
    if (!snapshot.compositeAttemptId) continue
    const group = snapshotsByAttempt.get(snapshot.compositeAttemptId) ?? []
    group.push(snapshot)
    snapshotsByAttempt.set(snapshot.compositeAttemptId, group)
  }

  const resolved: ReportingResolvedObservationV1[] = completed.map((row) => {
    const attempt = attemptById.get(row.runtimeBindingRef!)
    if (!attempt) throw new ReportingError('REPORT_RESULT_INTEGRITY', 'authoritative runtime result disappeared during reporting read', 500)
    const unitRows = (snapshotsByAttempt.get(attempt.id) ?? []).filter((snapshot) => snapshot.attemptEpoch === attempt.attemptEpoch)
    if (unitRows.length === 0) reportingFail('REPORT_RESULT_INTEGRITY', 'completed runtime has no canonical UNIT_RESULT snapshots', 500)
    const seen = new Set<string>()
    const metrics: ReportingResolvedMetricV1[] = []
    const hashes: Array<{ slotKey: string; resultHash: string }> = []
    for (const snapshot of unitRows) {
      const encrypted = snapshot.canonicalResultEncrypted
      if (!encrypted) throw new ReportingError('REPORT_RESULT_INTEGRITY', 'canonical UNIT_RESULT payload is missing', 500)
      let envelope
      try { envelope = parseStoredCanonicalUnitResult(encrypted) }
      catch { return reportingFail('REPORT_RESULT_INTEGRITY', 'canonical UNIT_RESULT payload is invalid', 500) }
      hashes.push({ slotKey: snapshot.slotKey, resultHash: envelope.resultHash })
      const resultQuality = asQuality(envelope.core.quality.status)
      for (const metric of envelope.core.metrics) {
        if (seen.has(metric.key)) reportingFail('AMBIGUOUS_OBSERVATION', `metric ${metric.key} appears in more than one canonical unit`, 409)
        seen.add(metric.key)
        metrics.push({ key: metric.key, value: metric.value, resultQuality, metricQuality: metric.quality ?? null })
      }
    }
    return {
      executionId: row.executionId,
      trackId: row.trackId,
      subject: actorFromRow(row, 'subject'),
      respondent: actorFromRow(row, 'respondent'),
      relationshipKind: row.relationshipKind,
      relationshipRef: row.relationshipRef,
      perspective: asPerspective(row.perspective),
      policyDomain: 'ORGANIZATION_RUN',
      canonicalResultHash: canonicalHash({ schema: 'ReportingCompositeCanonicalProjectionV1', executionId: row.executionId, attemptId: attempt.id, unitResults: hashes }),
      metrics,
      scientificMaturity: row.scientificMaturity,
      provenanceState: row.scientificMaturity && row.scientificProvenanceHash ? 'FROZEN' : 'LEGACY_UNFROZEN',
      scientificProvenanceHash: row.scientificProvenanceHash,
    }
  })

  return {
    organizationId: input.organizationId,
    runId: input.runId,
    trackId: input.trackId,
    resourceFamily: first.resourceFamily as ReportingResourceFamily,
    resourceKey: first.resourceKey,
    resourceVersion: first.resourceVersion,
    resourceMinimumN: effectiveMinimumN,
    resolved,
    unresolved,
  }
}

export const resolveAuthoritativeTrackObservations = (input: {
  organizationId: string
  runId: string
  trackId: string
}): Promise<ReportingObservationBatchV1> => (
  prisma.$transaction((tx) => resolveTrackInTransaction(tx, input), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
)

export const resolveAuthoritativeRunResults = (cohort: ReportingCohortSnapshotRecord): Promise<ReportingResultBatchV1> => (
  prisma.$transaction(async (tx) => {
    const batch = await resolveTrackInTransaction(tx, {
      organizationId: cohort.organizationId,
      runId: cohort.sourceRunId,
      trackId: cohort.sourceTrackId,
    })
    if (batch.resolved.length + batch.unresolved.length !== cohort.members.length) {
      reportingFail('REPORT_RESULT_INTEGRITY', 'Run execution population no longer matches frozen cohort', 500)
    }
    const memberByExecution = new Map(cohort.members.map((member) => [member.executionId, member]))
    const assertSelf = (observation: ReportingResolvedObservationV1 | ReportingUnresolvedObservationV1) => {
      const member = memberByExecution.get(observation.executionId)
      if (
        !member
        || observation.relationshipKind !== 'SELF'
        || observation.perspective !== 'SELF_REPORT'
        || observation.subject.userId !== observation.respondent.userId
        || observation.subject.userId !== member.userId
        || observation.subject.membershipId !== member.membershipId
        || observation.respondent.membershipId !== member.membershipId
      ) reportingFail('REPORT_ANALYSIS_KIND_UNSUPPORTED', 'generic group result source accepts frozen SELF observations only', 409)
    }
    batch.resolved.forEach(assertSelf)
    batch.unresolved.forEach(assertSelf)
    const resolved: ReportingResolvedExecutionV1[] = batch.resolved.map((observation) => ({
      executionId: observation.executionId,
      subjectUserId: observation.subject.userId,
      membershipId: observation.subject.membershipId!,
      trackId: observation.trackId,
      canonicalResultHash: observation.canonicalResultHash,
      metrics: observation.metrics,
      scientificMaturity: observation.scientificMaturity,
      provenanceState: observation.provenanceState,
      scientificProvenanceHash: observation.scientificProvenanceHash,
    }))
    const unresolved: ReportingUnresolvedExecutionV1[] = batch.unresolved.map((observation) => ({
      executionId: observation.executionId,
      subjectUserId: observation.subject.userId,
      membershipId: observation.subject.membershipId!,
      reason: observation.reason,
    }))
    return {
      resourceFamily: batch.resourceFamily,
      resourceKey: batch.resourceKey,
      resourceVersion: batch.resourceVersion,
      resourceMinimumN: batch.resourceMinimumN,
      resolved,
      unresolved,
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
)
