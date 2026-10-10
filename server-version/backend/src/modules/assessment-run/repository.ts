import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import type { RunResourceRef, RunTrackNarrowingRequest } from './resourceAuthority'

export type AssessmentRunStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED'
export type RunExecutionStatus = 'ASSIGNED' | 'STARTED' | 'COMPLETED' | 'EXPIRED' | 'REVOKED'
export type RunActorProvenanceKind = 'ORG_MEMBER' | 'EXTERNAL_PARENT'
export type RunActorRole = 'TEACHER' | 'STUDENT' | 'COUNSELOR' | 'CLIENT' | 'PARENT'

type Tx = Prisma.TransactionClient

export interface AssessmentRunRecord {
  id: string
  organizationId: string
  name: string
  status: AssessmentRunStatus
  version: number
  createdByUserId: string
  intakeDeadline: Date | null
  publishedAt: Date | null
  closedAt: Date | null
  cancelledAt: Date | null
}

export interface AssessmentRunTrackRecord {
  id: string
  organizationId: string
  runId: string
  resourceFamily: string
  resourceKey: string
  resourceVersion: string
  subjectSelector: unknown
  respondentSelector: unknown
  requestedPolicy: RunTrackNarrowingRequest
  frozenResourcePolicy: unknown | null
  resourcePolicyHash: string | null
}

export interface RunActorSnapshotRecord {
  id: string
  organizationId: string
  runId: string
  provenanceKind: RunActorProvenanceKind
  userId: string
  membershipId: string | null
  actorRole: RunActorRole
  externalRelationshipRef: string | null
  snapshotPayload: unknown
  snapshotHash: string
}

export class AssessmentRunRepositoryError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 409) {
    super(message)
    this.name = 'AssessmentRunRepositoryError'
  }
}

const runProjection = `
  "id", "organization_id" AS "organizationId", "name", "status", "version",
  "created_by_user_id" AS "createdByUserId", "intake_deadline" AS "intakeDeadline",
  "published_at" AS "publishedAt", "closed_at" AS "closedAt", "cancelled_at" AS "cancelledAt"
`

export async function createAssessmentRunDraft(input: {
  organizationId: string
  name: string
  createdByUserId: string
  intakeDeadline?: Date | null
  // Campus Activity transaction may atomically bind the Run, never orphaning
  // a draft on an interrupted binding.
  tx?: Tx
}): Promise<AssessmentRunRecord> {
  const name = input.name.trim()
  if (!name) throw new AssessmentRunRepositoryError('RUN_NAME_REQUIRED', 'Run name is required', 400)
  const id = randomUUID()
  const rows = await (input.tx ?? prisma).$queryRaw<AssessmentRunRecord[]>`
    INSERT INTO "assessment_runs" (
      "id", "organization_id", "name", "created_by_user_id", "intake_deadline"
    ) VALUES (
      ${id}, ${input.organizationId}, ${name}, ${input.createdByUserId}, ${input.intakeDeadline ?? null}
    )
    RETURNING ${Prisma.raw(runProjection)}
  `
  return rows[0]
}

export async function addAssessmentRunTrackDraft(input: {
  runId: string
  organizationId: string
  resource: RunResourceRef
  subjectSelector?: unknown
  respondentSelector?: unknown
  requestedPolicy: RunTrackNarrowingRequest
}): Promise<AssessmentRunTrackRecord> {
  return prisma.$transaction(async (tx) => {
    const runs = await tx.$queryRaw<Array<{ status: AssessmentRunStatus }>>`
      SELECT "status" FROM "assessment_runs"
      WHERE "organization_id" = ${input.organizationId} AND "id" = ${input.runId}
      FOR UPDATE
    `
    if (!runs[0]) throw new AssessmentRunRepositoryError('RUN_NOT_FOUND', 'Run not found', 404)
    if (runs[0].status !== 'DRAFT') {
      throw new AssessmentRunRepositoryError('RUN_STATE_CONFLICT', 'Only DRAFT Run may be edited', 409)
    }
    const id = randomUUID()
    const subjectJson = JSON.stringify(input.subjectSelector ?? {})
    const respondentJson = JSON.stringify(input.respondentSelector ?? {})
    const requestedJson = JSON.stringify(input.requestedPolicy)
    const rows = await tx.$queryRaw<AssessmentRunTrackRecord[]>`
      INSERT INTO "assessment_run_tracks" (
        "id", "organization_id", "run_id", "resource_family", "resource_key", "resource_version",
        "subject_selector", "respondent_selector", "requested_policy"
      ) VALUES (
        ${id}, ${input.organizationId}, ${input.runId}, ${input.resource.family}, ${input.resource.key}, ${input.resource.version},
        ${subjectJson}::jsonb, ${respondentJson}::jsonb, ${requestedJson}::jsonb
      )
      RETURNING "id", "organization_id" AS "organizationId", "run_id" AS "runId",
        "resource_family" AS "resourceFamily", "resource_key" AS "resourceKey", "resource_version" AS "resourceVersion",
        "subject_selector" AS "subjectSelector", "respondent_selector" AS "respondentSelector",
        "requested_policy" AS "requestedPolicy", "frozen_resource_policy" AS "frozenResourcePolicy",
        "resource_policy_hash" AS "resourcePolicyHash"
    `
    await tx.$executeRaw`
      UPDATE "assessment_runs"
      SET "version" = "version" + 1, "updated_at" = transaction_timestamp()
      WHERE "id" = ${input.runId}
    `
    return rows[0]
  })
}

export async function lockRun(tx: Tx, organizationId: string, runId: string): Promise<AssessmentRunRecord> {
  const rows = await tx.$queryRaw<AssessmentRunRecord[]>`
    SELECT ${Prisma.raw(runProjection)}
    FROM "assessment_runs"
    WHERE "organization_id" = ${organizationId} AND "id" = ${runId}
    FOR UPDATE
  `
  if (!rows[0]) throw new AssessmentRunRepositoryError('RUN_NOT_FOUND', 'Run not found', 404)
  return rows[0]
}

export async function listRunTracks(tx: Tx, organizationId: string, runId: string): Promise<AssessmentRunTrackRecord[]> {
  return tx.$queryRaw<AssessmentRunTrackRecord[]>`
    SELECT "id", "organization_id" AS "organizationId", "run_id" AS "runId",
      "resource_family" AS "resourceFamily", "resource_key" AS "resourceKey", "resource_version" AS "resourceVersion",
      "subject_selector" AS "subjectSelector", "respondent_selector" AS "respondentSelector",
      "requested_policy" AS "requestedPolicy", "frozen_resource_policy" AS "frozenResourcePolicy",
      "resource_policy_hash" AS "resourcePolicyHash"
    FROM "assessment_run_tracks"
    WHERE "organization_id" = ${organizationId} AND "run_id" = ${runId}
    ORDER BY "created_at", "id"
    FOR UPDATE
  `
}

export async function insertRunActorSnapshot(tx: Tx, input: {
  organizationId: string
  runId: string
  provenanceKind: RunActorProvenanceKind
  userId: string
  membershipId?: string | null
  actorRole: RunActorRole
  externalRelationshipRef?: string | null
  snapshotPayload: unknown
}): Promise<RunActorSnapshotRecord> {
  const id = randomUUID()
  const snapshotHash = canonicalHash(input.snapshotPayload)
  const payload = JSON.stringify(input.snapshotPayload)
  const rows = await tx.$queryRaw<RunActorSnapshotRecord[]>`
    INSERT INTO "assessment_run_actor_snapshots" (
      "id", "organization_id", "run_id", "provenance_kind", "user_id", "membership_id", "actor_role",
      "external_relationship_ref", "snapshot_payload", "snapshot_hash"
    ) VALUES (
      ${id}, ${input.organizationId}, ${input.runId}, ${input.provenanceKind}, ${input.userId}, ${input.membershipId ?? null},
      ${input.actorRole}, ${input.externalRelationshipRef ?? null}, ${payload}::jsonb, ${snapshotHash}
    )
    RETURNING "id", "organization_id" AS "organizationId", "run_id" AS "runId",
      "provenance_kind" AS "provenanceKind", "user_id" AS "userId", "membership_id" AS "membershipId",
      "actor_role" AS "actorRole", "external_relationship_ref" AS "externalRelationshipRef",
      "snapshot_payload" AS "snapshotPayload", "snapshot_hash" AS "snapshotHash"
  `
  return rows[0]
}

export async function insertRunRelationshipSnapshot(tx: Tx, input: {
  organizationId: string
  runId: string
  relationshipKind: string
  relationshipRef?: string | null
  subjectActorSnapshotId: string
  respondentActorSnapshotId: string
  snapshotPayload: unknown
}): Promise<{ id: string; snapshotHash: string }> {
  const id = randomUUID()
  const snapshotHash = canonicalHash(input.snapshotPayload)
  const payload = JSON.stringify(input.snapshotPayload)
  const rows = await tx.$queryRaw<Array<{ id: string; snapshotHash: string }>>`
    INSERT INTO "assessment_run_relationship_snapshots" (
      "id", "organization_id", "run_id", "relationship_kind", "relationship_ref",
      "subject_actor_snapshot_id", "respondent_actor_snapshot_id", "snapshot_payload", "snapshot_hash"
    ) VALUES (
      ${id}, ${input.organizationId}, ${input.runId}, ${input.relationshipKind}, ${input.relationshipRef ?? null},
      ${input.subjectActorSnapshotId}, ${input.respondentActorSnapshotId}, ${payload}::jsonb, ${snapshotHash}
    )
    RETURNING "id", "snapshot_hash" AS "snapshotHash"
  `
  return rows[0]
}

export async function insertRunExecution(tx: Tx, input: {
  organizationId: string
  runId: string
  trackId: string
  subjectActorSnapshotId: string
  respondentActorSnapshotId: string
  relationshipSnapshotId: string
  status?: RunExecutionStatus
  relationalAssignmentId?: string | null
  runtimeBindingKind?: string | null
  runtimeBindingRef?: string | null
  startedAt?: Date | null
  completedAt?: Date | null
}): Promise<{ id: string }> {
  const id = randomUUID()
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "assessment_run_executions" (
      "id", "organization_id", "run_id", "track_id", "subject_actor_snapshot_id", "respondent_actor_snapshot_id",
      "relationship_snapshot_id", "status", "relational_assignment_id", "runtime_binding_kind", "runtime_binding_ref",
      "started_at", "completed_at"
    ) VALUES (
      ${id}, ${input.organizationId}, ${input.runId}, ${input.trackId}, ${input.subjectActorSnapshotId},
      ${input.respondentActorSnapshotId}, ${input.relationshipSnapshotId}, ${input.status ?? 'ASSIGNED'},
      ${input.relationalAssignmentId ?? null}, ${input.runtimeBindingKind ?? null}, ${input.runtimeBindingRef ?? null},
      ${input.startedAt ?? null}, ${input.completedAt ?? null}
    )
    RETURNING "id"
  `
  return rows[0]
}
