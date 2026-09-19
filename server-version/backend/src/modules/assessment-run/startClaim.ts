import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { loadRunExecutionStartAdmission, type RunStartAdmission } from './startAdmission'

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

type ExecutionLockRow = {
  organizationId: string
  runId: string
  runtimeBindingKind: string | null
  runtimeBindingRef: string | null
  respondentUserId: string
}

const CLAIM_PROJECTION = `
  "id", "organization_id" AS "organizationId", "run_id" AS "runId", "execution_id" AS "executionId",
  "operation_key" AS "operationKey", "claim_generation" AS "claimGeneration", "state",
  "claimed_at" AS "claimedAt", "lease_until" AS "leaseUntil", "dispatched_at" AS "dispatchedAt",
  "completed_at" AS "completedAt", "aborted_at" AS "abortedAt", "unknown_at" AS "unknownAt"
`

const lockExecutionEnvelope = async (tx: Tx, executionId: string): Promise<ExecutionLockRow> => {
  const identity = await tx.$queryRaw<Array<{ organizationId: string; runId: string }>>`
    SELECT "organization_id" AS "organizationId", "run_id" AS "runId"
    FROM "assessment_run_executions"
    WHERE "id" = ${executionId}
    LIMIT 1
  `
  if (!identity[0]) throw new RunStartClaimError('RUN_EXECUTION_NOT_FOUND', 'Run execution not found', 404)
  await tx.$queryRaw`
    SELECT "id" FROM "organizations" WHERE "id" = ${identity[0].organizationId} FOR UPDATE
  `
  await tx.$queryRaw`
    SELECT "id" FROM "assessment_runs"
    WHERE "organization_id" = ${identity[0].organizationId} AND "id" = ${identity[0].runId}
    FOR UPDATE
  `
  const rows = await tx.$queryRaw<ExecutionLockRow[]>`
    SELECT e."organization_id" AS "organizationId", e."run_id" AS "runId",
      e."runtime_binding_kind" AS "runtimeBindingKind", e."runtime_binding_ref" AS "runtimeBindingRef",
      respondent."user_id" AS "respondentUserId"
    FROM "assessment_run_executions" e
    JOIN "assessment_run_actor_snapshots" respondent
      ON respondent."organization_id" = e."organization_id"
      AND respondent."run_id" = e."run_id"
      AND respondent."id" = e."respondent_actor_snapshot_id"
    WHERE e."id" = ${executionId}
    FOR UPDATE OF e
  `
  if (!rows[0]) throw new RunStartClaimError('RUN_EXECUTION_NOT_FOUND', 'Run execution not found', 404)
  return rows[0]
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

export const acquireRunExecutionStartClaim = async (input: {
  executionId: string
  actorUserId: string
  leaseMs?: number
}): Promise<RunStartClaimDecision> => {
  const leaseMs = input.leaseMs ?? 30_000
  if (!Number.isInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 5 * 60_000) {
    throw new RunStartClaimError('RUN_START_LEASE_INVALID', 'START claim lease must be between 1s and 5m', 400)
  }

  return prisma.$transaction(async (tx) => {
    const execution = await lockExecutionEnvelope(tx, input.executionId)
    if (execution.respondentUserId !== input.actorUserId) {
      throw new RunStartClaimError('RUN_EXECUTION_ACTOR', 'only the frozen respondent may own START', 403)
    }
    if (execution.runtimeBindingKind && execution.runtimeBindingRef) {
      const claim = await lockClaim(tx, input.executionId)
      return {
        kind: 'BOUND' as const,
        claim,
        runtimeBindingKind: execution.runtimeBindingKind,
        runtimeBindingRef: execution.runtimeBindingRef,
      }
    }

    const admission = await loadRunExecutionStartAdmission({
      tx,
      executionId: input.executionId,
      actorUserId: input.actorUserId,
    })
    const now = await dbNow(tx)
    const leaseUntil = leaseAt(now, leaseMs)
    const existing = await lockClaim(tx, input.executionId)

    if (!existing) {
      const id = randomUUID()
      const operationKey = `run-start:${input.executionId}:${randomUUID()}`
      const rows = await tx.$queryRaw<RunStartClaimRecord[]>`
        INSERT INTO "assessment_run_execution_start_claims" (
          "id", "organization_id", "run_id", "execution_id", "operation_key", "claim_generation",
          "state", "claimed_at", "lease_until", "updated_at"
        ) VALUES (
          ${id}, ${admission.execution.organizationId}, ${admission.execution.runId}, ${input.executionId},
          ${operationKey}, 1, 'CLAIMED', ${now}, ${leaseUntil}, ${now}
        )
        RETURNING ${Prisma.raw(CLAIM_PROJECTION)}
      `
      return { kind: 'ACQUIRED' as const, claim: rows[0], admission }
    }

    if (existing.state === 'COMPLETED') {
      throw new RunStartClaimError('RUN_START_BINDING_MISSING', 'completed START claim has no runtime binding', 500)
    }
    if (existing.state === 'ABORTED') return { kind: 'ABORTED' as const, claim: existing }

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
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
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
  input: { claimId: string; generation: number },
): Promise<void> => {
  const now = await dbNow(tx)
  const changed = await tx.$executeRaw`
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
