import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { parseStoredCanonicalUnitResult } from '../assessment-runtime/persistence'
import {
  ReportingError,
  reportingFail,
  type ReportingCohortSnapshotRecord,
  type ReportingResolvedExecutionV1,
  type ReportingResolvedMetricV1,
  type ReportingResultBatchV1,
  type ReportingResultQuality,
  type ReportingUnresolvedExecutionV1,
} from './types'

type Tx = Prisma.TransactionClient

type ExecutionRow = {
  executionId: string
  executionStatus: string
  trackId: string
  assignmentId: string | null
  runtimeBindingKind: string | null
  runtimeBindingRef: string | null
  subjectUserId: string
  membershipId: string | null
  respondentUserId: string
  relationshipKind: string
  resourceFamily: string
  resourceKey: string
  resourceVersion: string
  frozenResourcePolicy: Record<string, unknown> | null
  scientificMaturity: 'PILOT' | 'RESEARCH_READY' | 'RESEARCH_GRADE' | null
  scientificProvenanceHash: string | null
}

const asQuality = (value: string): ReportingResultQuality => {
  if (value === 'interpretable' || value === 'limited' || value === 'invalid') return value
  return reportingFail('REPORT_RESULT_INTEGRITY', 'canonical result has unknown quality state', 500)
}

const resolveInTransaction = async (
  tx: Tx,
  cohort: ReportingCohortSnapshotRecord,
): Promise<ReportingResultBatchV1> => {
  const executions = await tx.$queryRaw<ExecutionRow[]>`
    SELECT e."id" AS "executionId", e."status" AS "executionStatus", e."track_id" AS "trackId",
      e."relational_assignment_id" AS "assignmentId", e."runtime_binding_kind" AS "runtimeBindingKind", e."runtime_binding_ref" AS "runtimeBindingRef",
      subject."user_id" AS "subjectUserId", subject."membership_id" AS "membershipId", respondent."user_id" AS "respondentUserId",
      relationship."relationship_kind" AS "relationshipKind", t."resource_family" AS "resourceFamily", t."resource_key" AS "resourceKey",
      t."resource_version" AS "resourceVersion", t."frozen_resource_policy" AS "frozenResourcePolicy",
      e."scientific_maturity" AS "scientificMaturity", e."scientific_provenance_hash" AS "scientificProvenanceHash"
    FROM "assessment_run_executions" e
    JOIN "assessment_run_tracks" t ON t."organization_id"=e."organization_id" AND t."run_id"=e."run_id" AND t."id"=e."track_id"
    JOIN "assessment_run_actor_snapshots" subject ON subject."organization_id"=e."organization_id" AND subject."run_id"=e."run_id" AND subject."id"=e."subject_actor_snapshot_id"
    JOIN "assessment_run_actor_snapshots" respondent ON respondent."organization_id"=e."organization_id" AND respondent."run_id"=e."run_id" AND respondent."id"=e."respondent_actor_snapshot_id"
    JOIN "assessment_run_relationship_snapshots" relationship ON relationship."organization_id"=e."organization_id" AND relationship."run_id"=e."run_id" AND relationship."id"=e."relationship_snapshot_id"
    WHERE e."organization_id"=${cohort.organizationId} AND e."run_id"=${cohort.sourceRunId} AND e."track_id"=${cohort.sourceTrackId}
    ORDER BY e."id"
  `
  if (executions.length !== cohort.members.length) reportingFail('REPORT_RESULT_INTEGRITY', 'Run execution population no longer matches frozen cohort', 500)
  const memberByExecution = new Map(cohort.members.map((member) => [member.executionId, member]))
  for (const row of executions) {
    const member = memberByExecution.get(row.executionId)
    if (!member || row.subjectUserId !== member.userId || row.membershipId !== member.membershipId) {
      reportingFail('REPORT_RESULT_INTEGRITY', 'Run execution identity does not match frozen cohort', 500)
    }
    if (row.relationshipKind !== 'SELF' || row.subjectUserId !== row.respondentUserId) {
      reportingFail('REPORT_ANALYSIS_KIND_UNSUPPORTED', 'PR3 result source only accepts SELF observations', 409)
    }
  }
  const first = executions[0]
  if (!first) reportingFail('REPORT_COHORT_EMPTY', 'reporting cohort has no executions', 409)
  if (!['BUNDLE', 'SCALE', 'COGNITIVE', 'SITUATIONAL'].includes(first.resourceFamily)) {
    reportingFail('REPORT_ANALYSIS_KIND_UNSUPPORTED', 'resource family is not enabled for PR3 generic reporting', 409)
  }
  if (executions.some((row) => row.resourceFamily !== first.resourceFamily || row.resourceKey !== first.resourceKey || row.resourceVersion !== first.resourceVersion)) {
    reportingFail('REPORT_RESULT_INTEGRITY', 'Run Track contains mixed resource identities', 500)
  }
  const minimum = first.frozenResourcePolicy?.minimumRespondents
  const resourceMinimumN = typeof minimum === 'number' && Number.isInteger(minimum) && minimum > 0 ? minimum : null

  const unresolved: ReportingUnresolvedExecutionV1[] = executions
    .filter((row) => row.executionStatus !== 'COMPLETED')
    .map((row) => ({
      executionId: row.executionId,
      subjectUserId: row.subjectUserId,
      membershipId: row.membershipId!,
      reason: 'NOT_COMPLETED',
    }))
  const completed = executions.filter((row) => row.executionStatus === 'COMPLETED')
  if (completed.some((row) => !row.runtimeBindingRef || !row.runtimeBindingKind)) {
    reportingFail('REPORT_RESULT_INTEGRITY', 'completed Run execution is missing runtime binding', 500)
  }
  if (completed.some((row) => row.runtimeBindingKind !== 'COMPOSITE')) {
    reportingFail('REPORT_RESULT_SOURCE_UNSUPPORTED', 'completed Run runtime has no PR3 authoritative reporting adapter', 409)
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
    const runtimeRef = row.runtimeBindingRef!
    const attempt = attemptById.get(runtimeRef)
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
    where: {
      compositeAttemptId: { in: attemptIds },
      terminalState: 'COMPLETED',
      payloadKind: 'UNIT_RESULT',
    },
    orderBy: [{ compositeAttemptId: 'asc' }, { slotKey: 'asc' }],
    select: {
      compositeAttemptId: true,
      attemptEpoch: true,
      slotKey: true,
      canonicalResultEncrypted: true,
    },
  })
  const snapshotsByAttempt = new Map<string, typeof snapshots>()
  for (const snapshot of snapshots) {
    if (!snapshot.compositeAttemptId) continue
    const group = snapshotsByAttempt.get(snapshot.compositeAttemptId) ?? []
    group.push(snapshot)
    snapshotsByAttempt.set(snapshot.compositeAttemptId, group)
  }

  const resolved: ReportingResolvedExecutionV1[] = completed.map((row) => {
    const runtimeRef = row.runtimeBindingRef!
    const attempt = attemptById.get(runtimeRef)
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
      subjectUserId: row.subjectUserId,
      membershipId: row.membershipId!,
      trackId: row.trackId,
      canonicalResultHash: canonicalHash({ schema: 'ReportingCompositeCanonicalProjectionV1', executionId: row.executionId, attemptId: attempt.id, unitResults: hashes }),
      metrics,
      scientificMaturity: row.scientificMaturity,
      provenanceState: row.scientificMaturity && row.scientificProvenanceHash ? 'FROZEN' : 'LEGACY_UNFROZEN',
      scientificProvenanceHash: row.scientificProvenanceHash,
    }
  })

  return {
    resourceFamily: first.resourceFamily as ReportingResultBatchV1['resourceFamily'],
    resourceKey: first.resourceKey,
    resourceVersion: first.resourceVersion,
    resourceMinimumN,
    resolved,
    unresolved,
  }
}

export const resolveAuthoritativeRunResults = (cohort: ReportingCohortSnapshotRecord): Promise<ReportingResultBatchV1> => (
  prisma.$transaction((tx) => resolveInTransaction(tx, cohort), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
)
