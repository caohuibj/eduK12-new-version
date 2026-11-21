import type { RunResourceAuthorityRegistry } from './resourceAuthority'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { logger } from '../../utils/logger'
import { type RunPopulationProductScope } from './currentPopulationAuthority'
import type { RelationalAssignmentRow } from '../assessment-relational/repository'
import { assertCurrentRunStartAuthority, type StartAuthorityKnownEnvelope } from './startAuthority'
import {
  freezeRunExecutionScientificProvenanceWithDetailsInTransaction,
  type FrozenRunScientificDetails,
  type FrozenRunScientificProvenanceV1,
  type RunScientificMaturity,
} from './scientificProvenance'
import { loadRunExecutionStartAdmission, type RunAttemptIdentityBinding, type RunStartAdmission } from './startAdmission'

export type RunStartClaimState = 'CLAIMED' | 'DISPATCHED' | 'COMPLETED' | 'ABORTED' | 'UNKNOWN'

export interface RunStartClaimRecord {
  id: string
  organizationId: string
  runId: string
  executionId: string
  operationKey: string
  claimGeneration: number
  state: RunStartClaimState
  claimedAt: Date
  leaseUntil: Date
  dispatchedAt: Date | null
  completedAt: Date | null
  abortedAt: Date | null
  unknownAt: Date | null
  admittedAttemptIdentity: RunAttemptIdentityBinding
}

export type RunStartClaimDecision =
  | { kind: 'ACQUIRED'; claim: RunStartClaimRecord; admission: RunStartAdmission }
  | { kind: 'RECOVER'; claim: RunStartClaimRecord; admission: RunStartAdmission }
  | { kind: 'IN_PROGRESS'; claim: RunStartClaimRecord }
  | { kind: 'BOUND'; claim: RunStartClaimRecord | null; runtimeBindingKind: string; runtimeBindingRef: string }
  | { kind: 'ABORTED'; claim: RunStartClaimRecord }

export class RunStartClaimError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 409) {
    super(message)
    this.name = 'RunStartClaimError'
  }
}

type Tx = Prisma.TransactionClient

export type RunExecutionLockIdentity = {
  organizationId: string
  runId: string
  hasCampusActivity?: boolean
  hasHuiteacherLink?: boolean
}

export type ExecutionLockRow = RunExecutionLockIdentity & {
  executionId: string
  trackId: string
  executionStatus: string
  runStatus: string
  relationalAssignmentId: string | null
  policyDomain: string | null
  runtimeBindingKind: string | null
  runtimeBindingRef: string | null
  respondentUserId: string
  scientificFrozenAt: Date | null
  // Pre-projected same-lock fields to eliminate redundant in-tx SELECTs
  // across startAuthority, startAdmission, scientificProvenance, and dbNow.
  intakeDeadline?: Date | null
  orgStatus?: string
  orgProductDomain?: string
  subjectActorSnapshotId?: string
  respondentActorSnapshotId?: string
  subjectUserId?: string
  subjectRole?: string
  subjectProvenance?: string
  subjectMembershipId?: string | null
  subjectPersonaGrantId?: string | null
  respondentRole?: string
  respondentProvenance?: string
  respondentMembershipId?: string | null
  respondentPersonaGrantId?: string | null
  relationshipKind?: string
  relationshipRef?: string | null
  relationshipCourseId?: string | null
  relationshipStudentClassAssignmentId?: string | null
  relationshipStaffClassAssignmentId?: string | null
  relationshipClassUnitId?: string | null
  trackResourceFamily?: string
  trackResourceKey?: string
  trackResourceVersion?: string
  trackResourcePolicyHash?: string | null
  trackFrozenResourcePolicy?: unknown | null
  scientificMaturity?: RunScientificMaturity | null
  scientificProvenance?: FrozenRunScientificProvenanceV1 | null
  scientificProvenanceHash?: string | null
  txNow?: Date
  assignmentRow?: RelationalAssignmentRow | null
}

export const toStartAuthorityKnownEnvelope = (row: ExecutionLockRow): StartAuthorityKnownEnvelope | undefined => {
  if (
    !row.orgStatus || !row.orgProductDomain
    || !row.subjectActorSnapshotId || !row.respondentActorSnapshotId
    || !row.subjectUserId || !row.subjectRole || !row.subjectProvenance
    || !row.respondentRole || !row.respondentProvenance
    || !row.relationshipKind
    || !row.trackResourceFamily || !row.trackResourceKey || !row.trackResourceVersion
  ) {
    return undefined
  }
  return {
    executionId: row.executionId,
    organizationId: row.organizationId,
    runId: row.runId,
    trackId: row.trackId,
    executionStatus: row.executionStatus,
    orgStatus: row.orgStatus,
    orgProductDomain: row.orgProductDomain,
    subjectActorSnapshotId: row.subjectActorSnapshotId,
    respondentActorSnapshotId: row.respondentActorSnapshotId,
    subjectUserId: row.subjectUserId,
    subjectRole: row.subjectRole,
    subjectProvenance: row.subjectProvenance,
    subjectMembershipId: row.subjectMembershipId ?? null,
    subjectPersonaGrantId: row.subjectPersonaGrantId ?? null,
    respondentUserId: row.respondentUserId,
    respondentRole: row.respondentRole,
    respondentProvenance: row.respondentProvenance,
    respondentMembershipId: row.respondentMembershipId ?? null,
    respondentPersonaGrantId: row.respondentPersonaGrantId ?? null,
    relationshipKind: row.relationshipKind,
    relationshipRef: row.relationshipRef ?? null,
    relationshipCourseId: row.relationshipCourseId ?? null,
    relationshipStudentClassAssignmentId: row.relationshipStudentClassAssignmentId ?? null,
    relationshipStaffClassAssignmentId: row.relationshipStaffClassAssignmentId ?? null,
    relationshipClassUnitId: row.relationshipClassUnitId ?? null,
    trackResourceFamily: row.trackResourceFamily,
    trackResourceKey: row.trackResourceKey,
    trackResourceVersion: row.trackResourceVersion,
    intakeDeadline: row.intakeDeadline ?? null,
    hasCampusActivity: row.hasCampusActivity,
    hasHuiteacherLink: row.hasHuiteacherLink,
  }
}

export const resolveProductScopeFromLock = (identity: RunExecutionLockIdentity): RunPopulationProductScope => {
  if (identity.hasCampusActivity === true && identity.hasHuiteacherLink === false) return 'CAMPUS_ONLY'
  if (identity.hasHuiteacherLink === true && identity.hasCampusActivity === false) return 'HUITEACHER_ONLY'
  return 'ALL'
}

const CLAIM_PROJECTION = `
  "id", "organization_id" AS "organizationId", "run_id" AS "runId", "execution_id" AS "executionId",
  "operation_key" AS "operationKey", "claim_generation" AS "claimGeneration", "state",
  "claimed_at" AS "claimedAt", "lease_until" AS "leaseUntil", "dispatched_at" AS "dispatchedAt",
  "completed_at" AS "completedAt", "aborted_at" AS "abortedAt", "unknown_at" AS "unknownAt",
  "admitted_attempt_identity" AS "admittedAttemptIdentity"
`

export const lockExecutionEnvelope = async (
  tx: Tx,
  executionId: string,
  knownIdentity?: RunExecutionLockIdentity,
): Promise<ExecutionLockRow> => {
  // Dispatch already holds org/run on the committed claim. Reuse that
  // identity so this transaction does not SELECT the same execution row
  // once unlocked and again FOR UPDATE. Claim acquisition still reads it.
  let identity = knownIdentity
  if (!identity) {
    const rows = await tx.$queryRaw<Array<RunExecutionLockIdentity>>`
      SELECT e."organization_id" AS "organizationId", e."run_id" AS "runId",
        EXISTS (
          SELECT 1 FROM "campus_activity_runs" ar
          WHERE ar."organization_id" = e."organization_id" AND ar."run_id" = e."run_id"
        ) AS "hasCampusActivity",
        EXISTS (
          SELECT 1 FROM "huiteacher_evaluation_run_links" link
          WHERE link."organization_id" = e."organization_id" AND link."run_id" = e."run_id"
        ) AS "hasHuiteacherLink"
      FROM "assessment_run_executions" e
      WHERE e."id" = ${executionId}
      LIMIT 1
    `
    identity = rows[0]
  }
  if (!identity) throw new RunStartClaimError('RUN_EXECUTION_NOT_FOUND', 'Run execution not found', 404)
  // Read-only authority fences: SHARE still conflicts with lifecycle and
  // governance updates, while unrelated executions can START concurrently.
  // The execution row remains the exclusive admission/idempotency boundary.
  const needLinkFlags = identity.hasCampusActivity === undefined || identity.hasHuiteacherLink === undefined
  // The Run row lock depends on the id emitted by the organization row lock.
  // Keep product policy fences in subsequent statements for fresh reads.
  const runRows = await tx.$queryRaw<Array<{ id: string; hasCampusActivity?: boolean; hasHuiteacherLink?: boolean }>>`
    WITH locked_org AS MATERIALIZED (
      SELECT "id" FROM "organizations" WHERE "id" = ${identity.organizationId} FOR SHARE
    )
    SELECT r.*
    FROM locked_org o
    CROSS JOIN LATERAL (
      SELECT r."id" ${needLinkFlags ? Prisma.sql`,
        EXISTS (SELECT 1 FROM "campus_activity_runs" ar
          WHERE ar."organization_id" = r."organization_id" AND ar."run_id" = r."id") AS "hasCampusActivity",
        EXISTS (SELECT 1 FROM "huiteacher_evaluation_run_links" link
          WHERE link."organization_id" = r."organization_id" AND link."run_id" = r."id") AS "hasHuiteacherLink"` : Prisma.empty}
      FROM "assessment_runs" r
      WHERE r."organization_id" = o."id" AND r."id" = ${identity.runId}
      FOR SHARE OF r
    ) r
  `
  const runRow = runRows[0] as { id: string; hasCampusActivity?: boolean; hasHuiteacherLink?: boolean } | undefined
  const hasCampusActivity = identity.hasCampusActivity ?? runRow?.hasCampusActivity
  const hasHuiteacherLink = identity.hasHuiteacherLink ?? runRow?.hasHuiteacherLink
  // SCHOOL Activity pause/closure must serialize with START admission. This
  // SHARE lock conflicts with Activity's FOR UPDATE transition lock; current
  // population is rechecked under these fences after any wait.
  if (hasCampusActivity !== false) {
    await tx.$queryRaw`
      SELECT a."course_id" FROM "campus_activity_runs" ar
      JOIN "campus_activities" a ON a."course_id"=ar."course_id"
        AND a."organization_id"=ar."organization_id"
      WHERE ar."organization_id"=${identity.organizationId}
        AND ar."run_id"=${identity.runId}
      FOR SHARE OF a
    `
  }
  // Teacher event/policy suspension must serialize with an admitted START
  // under the same Organization/Run/Execution lock order.
  if (hasHuiteacherLink !== false) {
    await tx.$queryRaw`
      SELECT event."id" FROM "huiteacher_evaluation_run_links" link
      JOIN "huiteacher_evaluation_events" event
        ON event."organization_id"=link."organization_id"
        AND event."id"=link."event_id"
      WHERE link."organization_id"=${identity.organizationId}
        AND link."run_id"=${identity.runId}
      FOR SHARE OF event
    `
    await tx.$queryRaw`
      SELECT entitlement."organization_id"
      FROM "huiteacher_evaluation_run_links" link
      JOIN "education_product_entitlements" entitlement
        ON entitlement."organization_id"=link."organization_id"
        AND entitlement."product"='HUITEACHER'
      WHERE link."organization_id"=${identity.organizationId}
        AND link."run_id"=${identity.runId}
      FOR SHARE OF entitlement
    `
  }
  const rows = await tx.$queryRaw<ExecutionLockRow[]>`
    WITH target_exec AS MATERIALIZED (
      SELECT e.* FROM "assessment_run_executions" e
      WHERE e."id" = ${executionId}
      FOR UPDATE OF e
    )
    SELECT /* lockExecutionEnvelope: assessment_run_executions */
      e."organization_id" AS "organizationId", e."run_id" AS "runId",
      e."id" AS "executionId", e."track_id" AS "trackId",
      e."status" AS "executionStatus", r."status" AS "runStatus",
      r."intake_deadline" AS "intakeDeadline",
      o."status" AS "orgStatus", o."product_domain" AS "orgProductDomain",
      e."relational_assignment_id" AS "relationalAssignmentId",
      a."policy_domain" AS "policyDomain",
      e."runtime_binding_kind" AS "runtimeBindingKind", e."runtime_binding_ref" AS "runtimeBindingRef",
      e."subject_actor_snapshot_id" AS "subjectActorSnapshotId",
      e."respondent_actor_snapshot_id" AS "respondentActorSnapshotId",
      subject."user_id" AS "subjectUserId",
      subject."actor_role" AS "subjectRole",
      subject."provenance_kind" AS "subjectProvenance",
      subject."membership_id" AS "subjectMembershipId",
      subject."snapshot_payload"->>'personaGrantId' AS "subjectPersonaGrantId",
      respondent."user_id" AS "respondentUserId",
      respondent."actor_role" AS "respondentRole",
      respondent."provenance_kind" AS "respondentProvenance",
      respondent."membership_id" AS "respondentMembershipId",
      respondent."snapshot_payload"->>'personaGrantId' AS "respondentPersonaGrantId",
      relation."relationship_kind" AS "relationshipKind",
      relation."relationship_ref" AS "relationshipRef",
      relation."snapshot_payload"->'facts'->>'courseId' AS "relationshipCourseId",
      relation."snapshot_payload"->'facts'->>'studentClassAssignmentId' AS "relationshipStudentClassAssignmentId",
      relation."snapshot_payload"->'facts'->>'staffClassAssignmentId' AS "relationshipStaffClassAssignmentId",
      relation."snapshot_payload"->'facts'->>'classUnitId' AS "relationshipClassUnitId",
      t."resource_family" AS "trackResourceFamily",
      t."resource_key" AS "trackResourceKey",
      t."resource_version" AS "trackResourceVersion",
      t."resource_policy_hash" AS "trackResourcePolicyHash",
      t."frozen_resource_policy" AS "trackFrozenResourcePolicy",
      e."scientific_maturity" AS "scientificMaturity",
      e."scientific_provenance" AS "scientificProvenance",
      e."scientific_provenance_hash" AS "scientificProvenanceHash",
      e."scientific_frozen_at" AS "scientificFrozenAt",
      transaction_timestamp() AS "txNow",
      CASE WHEN a."id" IS NULL THEN NULL ELSE jsonb_build_object(
        'id', a."id",
        'episodeId', a."episode_id",
        'subjectUserId', a."subject_user_id",
        'subjectRole', a."subject_role",
        'respondentUserId', a."respondent_user_id",
        'respondentRole', a."respondent_role",
        'createdByUserId', a."created_by_user_id",
        'relationshipKind', a."relationship_kind",
        'relationshipRef', a."relationship_ref",
        'relationshipSnapshotJson', a."relationship_snapshot_json",
        'relationshipSnapshotHash', a."relationship_snapshot_hash",
        'perspective', a."perspective",
        'resourceKind', a."resource_kind",
        'resourceKey', a."resource_key",
        'resourceVersion', a."resource_version",
        'applicabilityHash', a."applicability_hash",
        'analysisMode', a."analysis_mode",
        'minimumRespondents', a."minimum_respondents",
        'consentId', a."consent_id",
        'visibilityPolicyKey', a."visibility_policy_key",
        'policyDomain', a."policy_domain",
        'status', a."status",
        'createdAt', to_char(a."created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'startedAt', CASE WHEN a."started_at" IS NULL THEN NULL ELSE to_char(a."started_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
        'completedAt', CASE WHEN a."completed_at" IS NULL THEN NULL ELSE to_char(a."completed_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
        'revokedAt', CASE WHEN a."revoked_at" IS NULL THEN NULL ELSE to_char(a."revoked_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END
      ) END AS "assignmentRow"
    FROM target_exec e
    JOIN "organizations" o ON o."id" = e."organization_id"
    JOIN "assessment_runs" r
      ON r."organization_id" = e."organization_id"
      AND r."id" = e."run_id"
    JOIN "assessment_run_tracks" t
      ON t."organization_id" = e."organization_id"
      AND t."run_id" = e."run_id"
      AND t."id" = e."track_id"
    JOIN "assessment_run_relationship_snapshots" relation
      ON relation."id" = e."relationship_snapshot_id"
    JOIN "assessment_run_actor_snapshots" subject
      ON subject."organization_id" = e."organization_id"
      AND subject."run_id" = e."run_id"
      AND subject."id" = e."subject_actor_snapshot_id"
    JOIN "assessment_run_actor_snapshots" respondent
      ON respondent."organization_id" = e."organization_id"
      AND respondent."run_id" = e."run_id"
      AND respondent."id" = e."respondent_actor_snapshot_id"
    LEFT JOIN "relational_assessment_assignments" a
      ON a."id" = e."relational_assignment_id"
  `
  if (!rows[0]) throw new RunStartClaimError('RUN_EXECUTION_NOT_FOUND', 'Run execution not found', 404)
  if (rows[0].organizationId !== identity.organizationId || rows[0].runId !== identity.runId) {
    throw new RunStartClaimError('RUN_START_ENVELOPE_IDENTITY', 'START envelope identity diverged under lock', 500)
  }
  return {
    ...rows[0],
    ...(hasCampusActivity !== undefined ? { hasCampusActivity } : {}),
    ...(hasHuiteacherLink !== undefined ? { hasHuiteacherLink } : {}),
  }
}

const lockClaim = async (tx: Tx, executionId: string): Promise<RunStartClaimRecord | null> => {
  const rows = await tx.$queryRaw<RunStartClaimRecord[]>`
    SELECT ${Prisma.raw(CLAIM_PROJECTION)}
    FROM "assessment_run_execution_start_claims"
    WHERE "execution_id" = ${executionId}
    FOR UPDATE
  `
  return rows[0] ?? null
}

const dbNow = async (tx: Tx): Promise<Date> => {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT transaction_timestamp() AS "now"`
  return rows[0].now
}

const leaseAt = (now: Date, leaseMs: number): Date => new Date(now.getTime() + leaseMs)

export type TransactionalStartDispatchContext = {
  tx: Tx
  claim: RunStartClaimRecord
  admission: RunStartAdmission
  execution: ExecutionLockRow
  productScope: RunPopulationProductScope
  now?: Date
  scientificDetails?: FrozenRunScientificDetails
}

export async function acquireRunExecutionStartClaim(input: {
  executionId: string
  actorUserId: string
  leaseMs?: number
  resourceRegistry?: RunResourceAuthorityRegistry
}): Promise<RunStartClaimDecision>
export async function acquireRunExecutionStartClaim<TInlineResult>(input: {
  executionId: string
  actorUserId: string
  leaseMs?: number
  resourceRegistry?: RunResourceAuthorityRegistry
  knownIdentity?: RunExecutionLockIdentity
  transactionalDispatch?: (ctx: TransactionalStartDispatchContext) => Promise<TInlineResult | null>
}): Promise<RunStartClaimDecision | { kind: 'COMPLETED_INLINE'; result: TInlineResult }>
export async function acquireRunExecutionStartClaim<TInlineResult>(input: {
  executionId: string
  actorUserId: string
  leaseMs?: number
  resourceRegistry?: RunResourceAuthorityRegistry
  knownIdentity?: RunExecutionLockIdentity
  transactionalDispatch?: (ctx: TransactionalStartDispatchContext) => Promise<TInlineResult | null>
}): Promise<RunStartClaimDecision | { kind: 'COMPLETED_INLINE'; result: TInlineResult }> {
  const leaseMs = input.leaseMs ?? 30_000
  if (!Number.isInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 5 * 60_000) {
    throw new RunStartClaimError('RUN_START_LEASE_INVALID', 'START claim lease must be between 1s and 5m', 400)
  }

  return prisma.$transaction(async (tx) => {
    const execution = await lockExecutionEnvelope(tx, input.executionId, input.knownIdentity)
    if (execution.respondentUserId !== input.actorUserId) {
      throw new RunStartClaimError('RUN_EXECUTION_ACTOR', 'only the frozen respondent may own START', 403)
    }
    // Decision D-1 / D-3 (2026-11-06, product-confirmed): a BOUND replay
    // intentionally performs NO Run-status or authority recheck here. A Run
    // CLOSE (D-1) or a membership / role / participation revocation (D-3)
    // blocks only NEW intake: fresh claims below go through
    // assertCurrentRunStartAuthority and the PUBLISHED check, while work that
    // is already bound finishes under its frozen admission. Do not add a
    // recheck to this branch without a new product decision.
    if (execution.runtimeBindingKind && execution.runtimeBindingRef) {
      const claim = await lockClaim(tx, input.executionId)
      return {
        kind: 'BOUND' as const,
        claim,
        runtimeBindingKind: execution.runtimeBindingKind,
        runtimeBindingRef: execution.runtimeBindingRef,
      }
    }

    const productScope = resolveProductScopeFromLock(execution)
    // Must execute as a separate statement AFTER `FOR UPDATE OF e` acquires the
    // execution lock so READ COMMITTED takes a fresh snapshot and sees any claim
    // committed by a concurrent START holder that did not mutate `e`.
    const existing = await lockClaim(tx, input.executionId)
    if (existing?.state === 'ABORTED') return { kind: 'ABORTED' as const, claim: existing }
    if (!existing) {
      await assertCurrentRunStartAuthority(tx, input.executionId, {
        accountMode: 'DETECT_EDUCATION_LIBRARY',
        productScope,
        knownEnvelope: toStartAuthorityKnownEnvelope(execution),
      })
    }
    const admission = await loadRunExecutionStartAdmission({
      tx,
      executionId: input.executionId,
      actorUserId: input.actorUserId,
      admitted: Boolean(existing),
      knownExecution: execution,
      knownAssignmentRow: existing ? undefined : execution.assignmentRow,
    })
    const now = execution.txNow ?? await dbNow(tx)
    const leaseUntil = leaseAt(now, leaseMs)
    if (!existing) {
      const knownScientificRow = execution.trackResourceFamily && execution.trackResourceKey && execution.trackResourceVersion
        ? {
            organizationId: execution.organizationId,
            resourceFamily: execution.trackResourceFamily,
            resourceKey: execution.trackResourceKey,
            resourceVersion: execution.trackResourceVersion,
            resourcePolicyHash: execution.trackResourcePolicyHash ?? null,
            frozenResourcePolicy: execution.trackFrozenResourcePolicy ?? null,
            scientificMaturity: execution.scientificMaturity ?? null,
            scientificProvenance: execution.scientificProvenance ?? null,
            scientificProvenanceHash: execution.scientificProvenanceHash ?? null,
            scientificFrozenAt: execution.scientificFrozenAt ?? null,
          }
        : undefined
      const scientificDetails = await freezeRunExecutionScientificProvenanceWithDetailsInTransaction(
        tx,
        input.executionId,
        input.resourceRegistry,
        {
          organizationId: execution.organizationId,
          hasCampusActivity: execution.hasCampusActivity,
          hasHuiteacherLink: execution.hasHuiteacherLink,
          now,
          alreadyLocked: true,
          ...(knownScientificRow ? { knownRow: knownScientificRow } : {}),
        },
      )
      const id = randomUUID()
      const operationKey = `run-start:${input.executionId}:${randomUUID()}`
      const rows = await tx.$queryRaw<RunStartClaimRecord[]>`
        WITH inserted_claim AS (
          INSERT INTO "assessment_run_execution_start_claims" (
            "id", "organization_id", "run_id", "execution_id", "operation_key", "claim_generation",
            "state", "claimed_at", "lease_until", "admitted_attempt_identity", "updated_at"
          ) VALUES (
            ${id}, ${admission.execution.organizationId}, ${admission.execution.runId}, ${input.executionId},
            ${operationKey}, 1, 'CLAIMED', ${now}, ${leaseUntil}, ${JSON.stringify(admission.attemptIdentity)}::jsonb, ${now}
          )
          RETURNING ${Prisma.raw(CLAIM_PROJECTION)}
        ),
        inserted_audit AS (
          INSERT INTO "organization_governance_audits"
            ("id", "organization_id", "actor_user_id", "action", "target_type", "target_id", "domain_event_id", "payload")
          VALUES (${randomUUID()}, ${execution.organizationId}, ${input.actorUserId}, 'ASSESSMENT_RUN_START_ADMITTED',
            'AssessmentRunExecution', ${input.executionId}, ${id},
            ${JSON.stringify({ operationKey, assignmentId: admission.assignment.assignmentId, attemptIdentity: admission.attemptIdentity })}::jsonb)
        )
        SELECT * FROM inserted_claim
      `
      if (input.transactionalDispatch) {
        const inlineResult = await input.transactionalDispatch({
          tx,
          claim: rows[0],
          admission,
          execution,
          productScope,
          now,
          scientificDetails,
        })
        if (inlineResult !== null) {
          return { kind: 'COMPLETED_INLINE' as const, result: inlineResult }
        }
      }
      return { kind: 'ACQUIRED' as const, claim: rows[0], admission }
    }

    if (existing.state === 'COMPLETED') {
      throw new RunStartClaimError('RUN_START_BINDING_MISSING', 'completed START claim has no runtime binding', 500)
    }

    if (existing.leaseUntil.getTime() > now.getTime()) {
      return { kind: 'IN_PROGRESS' as const, claim: existing }
    }

    const nextGeneration = existing.claimGeneration + 1
    const rows = await tx.$queryRaw<RunStartClaimRecord[]>`
      UPDATE "assessment_run_execution_start_claims"
      SET "claim_generation" = ${nextGeneration}, "claimed_at" = ${now}, "lease_until" = ${leaseUntil},
          "updated_at" = ${now}
      WHERE "id" = ${existing.id} AND "claim_generation" = ${existing.claimGeneration}
      RETURNING ${Prisma.raw(CLAIM_PROJECTION)}
    `
    const claimed = rows[0]
    if (!claimed) throw new RunStartClaimError('RUN_START_CLAIM_CONFLICT', 'START claim changed concurrently', 409)
    return claimed.state === 'CLAIMED'
      ? { kind: 'ACQUIRED' as const, claim: claimed, admission }
      : { kind: 'RECOVER' as const, claim: claimed, admission }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 })
}

export const markRunStartDispatchIntent = async (input: {
  claimId: string
  generation: number
  leaseMs?: number
}): Promise<RunStartClaimRecord> => {
  const leaseMs = input.leaseMs ?? 30_000
  return prisma.$transaction(async (tx) => {
    const now = await dbNow(tx)
    const rows = await tx.$queryRaw<RunStartClaimRecord[]>`
      UPDATE "assessment_run_execution_start_claims"
      SET "state" = 'DISPATCHED', "dispatched_at" = COALESCE("dispatched_at", ${now}),
          "lease_until" = ${leaseAt(now, leaseMs)}, "updated_at" = ${now}
      WHERE "id" = ${input.claimId} AND "claim_generation" = ${input.generation} AND "state" = 'CLAIMED'
      RETURNING ${Prisma.raw(CLAIM_PROJECTION)}
    `
    if (!rows[0]) throw new RunStartClaimError('RUN_START_FENCE_LOST', 'START claim ownership fence was lost', 409)
    return rows[0]
  })
}

export const markRunStartUnknown = async (input: {
  claimId: string
  generation: number
}): Promise<RunStartClaimRecord> => prisma.$transaction(async (tx) => {
  const now = await dbNow(tx)
  const rows = await tx.$queryRaw<RunStartClaimRecord[]>`
    UPDATE "assessment_run_execution_start_claims"
    SET "state" = 'UNKNOWN', "unknown_at" = ${now}, "updated_at" = ${now}
    WHERE "id" = ${input.claimId} AND "claim_generation" = ${input.generation}
      AND "state" IN ('DISPATCHED','UNKNOWN')
    RETURNING ${Prisma.raw(CLAIM_PROJECTION)}
  `
  if (!rows[0]) throw new RunStartClaimError('RUN_START_FENCE_LOST', 'START claim ownership fence was lost', 409)
  return rows[0]
})

export const markRunStartClaimCompleted = async (
  tx: Tx,
  input: { claimId: string; generation: number; now?: Date; allowClaimedInline?: boolean },
): Promise<void> => {
  const now = input.now ?? await dbNow(tx)
  const changed = input.allowClaimedInline
    ? await tx.$executeRaw`
        UPDATE "assessment_run_execution_start_claims"
        SET "state" = 'COMPLETED',
            "dispatched_at" = COALESCE("dispatched_at", ${now}),
            "completed_at" = ${now},
            "unknown_at" = NULL,
            "updated_at" = ${now}
        WHERE "id" = ${input.claimId} AND "claim_generation" = ${input.generation} AND "state" IN ('CLAIMED','DISPATCHED','UNKNOWN')
      `
    : await tx.$executeRaw`
        UPDATE "assessment_run_execution_start_claims"
        SET "state" = 'COMPLETED', "completed_at" = ${now}, "unknown_at" = NULL, "updated_at" = ${now}
        WHERE "id" = ${input.claimId} AND "claim_generation" = ${input.generation} AND "state" IN ('DISPATCHED','UNKNOWN')
      `
  if (Number(changed) !== 1) throw new RunStartClaimError('RUN_START_FENCE_LOST', 'START claim ownership fence was lost', 409)
}

export const abortUndispatchedRunStartClaim = async (
  tx: Tx,
  input: { executionId: string },
): Promise<boolean> => {
  const now = await dbNow(tx)
  const changed = await tx.$executeRaw`
    UPDATE "assessment_run_execution_start_claims"
    SET "state" = 'ABORTED', "aborted_at" = ${now}, "updated_at" = ${now}
    WHERE "execution_id" = ${input.executionId} AND "state" = 'CLAIMED' AND "dispatched_at" IS NULL
  `
  return Number(changed) === 1
}

/** The runtime dispatch transaction rolled back with a known-safe outcome, so
 * nothing from this attempt committed — but the CLAIMED row from the first
 * transaction still holds its lease. Shorten only that undispatched claim's
 * lease so the next request can take over immediately through the existing
 * generation CAS, instead of waiting out the full lease. The row itself, its
 * operationKey, its frozen admission identity and the audit trail stay.
 * DISPATCHED/UNKNOWN/COMPLETED/ABORTED claims and executions that already
 * carry a runtime binding are never touched. This must NOT route through
 * abortUndispatchedRunStartClaim: ABORTED is the terminal lifecycle state and
 * would turn a retryable busy outcome into a permanent RUN_START_ABORTED. */
export const releaseRolledBackRunStartClaim = async (input: {
  claimId: string
  executionId: string
  generation: number
}): Promise<boolean> => {
  try {
    const changed = await prisma.$executeRaw`
      UPDATE "assessment_run_execution_start_claims" c
      SET "lease_until" = transaction_timestamp(), "updated_at" = transaction_timestamp()
      WHERE c."id" = ${input.claimId}
        AND c."execution_id" = ${input.executionId}
        AND c."claim_generation" = ${input.generation}
        AND c."state" = 'CLAIMED'
        AND c."dispatched_at" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "assessment_run_executions" e
          WHERE e."id" = c."execution_id"
            AND (e."runtime_binding_kind" IS NOT NULL OR e."runtime_binding_ref" IS NOT NULL)
        )
    `
    return Number(changed) === 1
  } catch (err) {
    // Safe degradation: keep the original lease and its existing recovery
    // path; the caller reports the real remaining wait to the client.
    logger.warn('Run START rolled-back claim lease release failed', {
      claimId: input.claimId,
      executionId: input.executionId,
      generation: input.generation,
      error: err,
    })
    return false
  }
}
