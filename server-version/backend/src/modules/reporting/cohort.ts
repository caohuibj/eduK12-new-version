import { randomUUID } from 'node:crypto'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import {
  reportingFail,
  type ReportingCohortMemberV1,
  type ReportingCohortSnapshotPayloadV1,
  type ReportingCohortSnapshotRecord,
} from './types'

type PopulationRow = {
  runStatus: string
  resourceFamily: string
  executionId: string
  actorSnapshotId: string
  subjectUserId: string
  membershipId: string | null
  respondentUserId: string
  relationshipKind: string
}

type CohortRow = {
  id: string
  organizationId: string
  sourceRunId: string
  sourceTrackId: string
  selector: ReportingCohortSnapshotPayloadV1['selector']
  members: ReportingCohortMemberV1[]
  eligibleN: number
  cohortIdentityHash: string
  snapshotHash: string
  generatedByUserId: string
  generatedAt: Date
}

const memberSort = (left: ReportingCohortMemberV1, right: ReportingCohortMemberV1): number => {
  const a = `${left.userId}\u0000${left.membershipId}\u0000${left.executionId}`
  const b = `${right.userId}\u0000${right.membershipId}\u0000${right.executionId}`
  return a < b ? -1 : a > b ? 1 : 0
}

const payloadFor = (row: CohortRow): ReportingCohortSnapshotPayloadV1 => ({
  schemaVersion: 1,
  organizationId: row.organizationId,
  source: { kind: 'RUN_TRACK', runId: row.sourceRunId, trackId: row.sourceTrackId },
  selector: row.selector,
  members: [...row.members].sort(memberSort),
  eligibleN: row.eligibleN,
  generatedByUserId: row.generatedByUserId,
  generatedAt: row.generatedAt.toISOString(),
})

const assertRecordIntegrity = (row: CohortRow): ReportingCohortSnapshotRecord => {
  const memberKeys = row.members.map((member) => ({ userId: member.userId, membershipId: member.membershipId }))
    .sort((left, right) => `${left.userId}\u0000${left.membershipId}`.localeCompare(`${right.userId}\u0000${right.membershipId}`))
  const identity = canonicalHash({
    schema: 'ReportingCohortIdentityV1',
    organizationId: row.organizationId,
    source: { kind: 'RUN_TRACK', runId: row.sourceRunId, trackId: row.sourceTrackId },
    selector: row.selector,
    members: memberKeys,
  })
  if (identity !== row.cohortIdentityHash || canonicalHash(payloadFor(row)) !== row.snapshotHash) {
    reportingFail('REPORT_COHORT_INTEGRITY', 'stored cohort snapshot failed integrity verification', 500)
  }
  if (row.eligibleN !== row.members.length) reportingFail('REPORT_COHORT_INTEGRITY', 'stored cohort eligibleN is inconsistent', 500)
  return row
}

export const freezeRunTrackCohort = async (input: {
  organizationId: string
  runId: string
  trackId: string
  generatedByUserId: string
}): Promise<ReportingCohortSnapshotRecord> => {
  const rows = await prisma.$queryRaw<PopulationRow[]>`
    SELECT r."status" AS "runStatus", t."resource_family" AS "resourceFamily",
      e."id" AS "executionId", subject."id" AS "actorSnapshotId", subject."user_id" AS "subjectUserId",
      subject."membership_id" AS "membershipId", respondent."user_id" AS "respondentUserId",
      relationship."relationship_kind" AS "relationshipKind"
    FROM "assessment_run_executions" e
    JOIN "assessment_runs" r ON r."organization_id"=e."organization_id" AND r."id"=e."run_id"
    JOIN "assessment_run_tracks" t ON t."organization_id"=e."organization_id" AND t."run_id"=e."run_id" AND t."id"=e."track_id"
    JOIN "assessment_run_actor_snapshots" subject ON subject."organization_id"=e."organization_id" AND subject."run_id"=e."run_id" AND subject."id"=e."subject_actor_snapshot_id"
    JOIN "assessment_run_actor_snapshots" respondent ON respondent."organization_id"=e."organization_id" AND respondent."run_id"=e."run_id" AND respondent."id"=e."respondent_actor_snapshot_id"
    JOIN "assessment_run_relationship_snapshots" relationship ON relationship."organization_id"=e."organization_id" AND relationship."run_id"=e."run_id" AND relationship."id"=e."relationship_snapshot_id"
    WHERE e."organization_id"=${input.organizationId} AND e."run_id"=${input.runId} AND e."track_id"=${input.trackId}
    ORDER BY subject."user_id", subject."membership_id", e."id"
  `
  if (rows.length === 0) reportingFail('REPORT_COHORT_EMPTY', 'Run Track has no frozen reporting population', 409)
  if (rows.some((row) => row.runStatus === 'DRAFT')) reportingFail('REPORT_COHORT_SOURCE_STATE', 'draft Run cannot produce a reporting cohort', 409)
  if (rows.some((row) => row.resourceFamily === 'FORM')) reportingFail('REPORT_ANALYSIS_KIND_UNSUPPORTED', 'FORM has no independent generic reporting contract in PR3', 409)
  if (rows.some((row) => row.relationshipKind !== 'SELF' || row.subjectUserId !== row.respondentUserId)) {
    reportingFail('REPORT_ANALYSIS_KIND_UNSUPPORTED', 'PR3 generic group reporting accepts SELF observations only', 409)
  }
  if (rows.some((row) => !row.membershipId)) {
    reportingFail('REPORT_COHORT_IDENTITY', 'generic Organization cohort requires frozen Membership provenance', 409)
  }
  const members = rows.map<ReportingCohortMemberV1>((row) => ({
    userId: row.subjectUserId,
    membershipId: row.membershipId!,
    actorSnapshotId: row.actorSnapshotId,
    executionId: row.executionId,
  })).sort(memberSort)
  const memberIdentity = new Set(members.map((member) => `${member.userId}\u0000${member.membershipId}`))
  if (memberIdentity.size !== members.length) {
    reportingFail('AMBIGUOUS_OBSERVATION', 'Run Track contains more than one SELF execution for a subject Membership', 409)
  }
  const selector = { kind: 'RUN_TRACK_SUBJECTS' as const, runId: input.runId, trackId: input.trackId }
  const cohortIdentityHash = canonicalHash({
    schema: 'ReportingCohortIdentityV1',
    organizationId: input.organizationId,
    source: { kind: 'RUN_TRACK', runId: input.runId, trackId: input.trackId },
    selector,
    members: members.map(({ userId, membershipId }) => ({ userId, membershipId })),
  })
  const generatedAt = new Date()
  const id = randomUUID()
  const payload: ReportingCohortSnapshotPayloadV1 = {
    schemaVersion: 1,
    organizationId: input.organizationId,
    source: { kind: 'RUN_TRACK', runId: input.runId, trackId: input.trackId },
    selector,
    members,
    eligibleN: members.length,
    generatedByUserId: input.generatedByUserId,
    generatedAt: generatedAt.toISOString(),
  }
  const snapshotHash = canonicalHash(payload)
  const inserted = await prisma.$queryRaw<CohortRow[]>`
    INSERT INTO "reporting_cohort_snapshots"
      ("id","organization_id","source_run_id","source_track_id","selector","members","eligible_n","cohort_identity_hash","snapshot_hash","generated_by_user_id","generated_at")
    VALUES (${id},${input.organizationId},${input.runId},${input.trackId},${JSON.stringify(selector)}::jsonb,${JSON.stringify(members)}::jsonb,${members.length},${cohortIdentityHash},${snapshotHash},${input.generatedByUserId},${generatedAt})
    ON CONFLICT ("organization_id","cohort_identity_hash") DO NOTHING
    RETURNING "id", "organization_id" AS "organizationId", "source_run_id" AS "sourceRunId", "source_track_id" AS "sourceTrackId",
      "selector", "members", "eligible_n" AS "eligibleN", "cohort_identity_hash" AS "cohortIdentityHash", "snapshot_hash" AS "snapshotHash",
      "generated_by_user_id" AS "generatedByUserId", "generated_at" AS "generatedAt"
  `
  if (inserted[0]) return assertRecordIntegrity(inserted[0])
  const existing = await prisma.$queryRaw<CohortRow[]>`
    SELECT "id", "organization_id" AS "organizationId", "source_run_id" AS "sourceRunId", "source_track_id" AS "sourceTrackId",
      "selector", "members", "eligible_n" AS "eligibleN", "cohort_identity_hash" AS "cohortIdentityHash", "snapshot_hash" AS "snapshotHash",
      "generated_by_user_id" AS "generatedByUserId", "generated_at" AS "generatedAt"
    FROM "reporting_cohort_snapshots" WHERE "organization_id"=${input.organizationId} AND "cohort_identity_hash"=${cohortIdentityHash} LIMIT 1
  `
  return assertRecordIntegrity(existing[0] ?? reportingFail('REPORT_COHORT_REUSE', 'cohort create-or-reuse failed', 500))
}

export const readReportingCohort = async (cohortId: string): Promise<ReportingCohortSnapshotRecord> => {
  const rows = await prisma.$queryRaw<CohortRow[]>`
    SELECT "id", "organization_id" AS "organizationId", "source_run_id" AS "sourceRunId", "source_track_id" AS "sourceTrackId",
      "selector", "members", "eligible_n" AS "eligibleN", "cohort_identity_hash" AS "cohortIdentityHash", "snapshot_hash" AS "snapshotHash",
      "generated_by_user_id" AS "generatedByUserId", "generated_at" AS "generatedAt"
    FROM "reporting_cohort_snapshots" WHERE "id"=${cohortId} LIMIT 1
  `
  return assertRecordIntegrity(rows[0] ?? reportingFail('REPORT_COHORT_NOT_FOUND', 'reporting cohort not found', 404))
}
