import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'

export class RunLifecycleError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 409) {
    super(message)
    this.name = 'RunLifecycleError'
  }
}

type Tx = Prisma.TransactionClient

type ExecutionLifecycleRow = {
  id: string
  status: string
  relationalAssignmentId: string | null
  runtimeBindingRef: string | null
  claimState: string | null
  claimDispatchedAt: Date | null
}

const lockRunEnvelope = async (tx: Tx, organizationId: string, runId: string) => {
  const organizations = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "organizations" WHERE "id" = ${organizationId} FOR UPDATE
  `
  if (!organizations[0]) throw new RunLifecycleError('ORG_NOT_FOUND', 'Organization not found', 404)
  const runs = await tx.$queryRaw<Array<{ status: string }>>`
    SELECT "status" FROM "assessment_runs"
    WHERE "organization_id" = ${organizationId} AND "id" = ${runId}
    FOR UPDATE
  `
  if (!runs[0]) throw new RunLifecycleError('RUN_NOT_FOUND', 'Run not found', 404)
  return runs[0]
}

const lockExecutions = async (tx: Tx, runId: string): Promise<ExecutionLifecycleRow[]> => {
  const executions = await tx.$queryRaw<Array<{
    id: string
    status: string
    relationalAssignmentId: string | null
    runtimeBindingRef: string | null
  }>>`
    SELECT "id", "status", "relational_assignment_id" AS "relationalAssignmentId",
      "runtime_binding_ref" AS "runtimeBindingRef"
    FROM "assessment_run_executions"
    WHERE "run_id" = ${runId}
    ORDER BY "id"
    FOR UPDATE
  `
  if (executions.length === 0) return []
  const ids = executions.map((row) => row.id)
  const claims = await tx.$queryRaw<Array<{
    executionId: string
    state: string
    dispatchedAt: Date | null
  }>>`
    SELECT "execution_id" AS "executionId", "state", "dispatched_at" AS "dispatchedAt"
    FROM "assessment_run_execution_start_claims"
    WHERE "execution_id" IN (${Prisma.join(ids)})
    ORDER BY "execution_id"
    FOR UPDATE
  `
  const claimByExecution = new Map(claims.map((claim) => [claim.executionId, claim]))
  return executions.map((row) => {
    const claim = claimByExecution.get(row.id)
    return {
      ...row,
      claimState: claim?.state ?? null,
      claimDispatchedAt: claim?.dispatchedAt ?? null,
    }
  })
}

const expireUnstarted = async (tx: Tx, row: ExecutionLifecycleRow, mode: 'CLOSE' | 'CANCEL') => {
  if (row.status === 'COMPLETED') return
  const executionState = mode === 'CLOSE' ? 'EXPIRED' : 'CANCELLED'
  const assignmentState = mode === 'CLOSE' ? 'EXPIRED' : 'REVOKED'
  const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT transaction_timestamp() AS "now"`
  const now = nowRows[0].now

  if (row.claimState === 'CLAIMED' && !row.claimDispatchedAt) {
    await tx.$executeRaw`
      UPDATE "assessment_run_execution_start_claims"
      SET "state" = 'ABORTED', "aborted_at" = ${now}, "updated_at" = ${now}
      WHERE "execution_id" = ${row.id} AND "state" = 'CLAIMED' AND "dispatched_at" IS NULL
    `
  }
  await tx.$executeRaw`
    UPDATE "assessment_run_executions"
    SET "status" = ${executionState}, "updated_at" = ${now}
    WHERE "id" = ${row.id} AND "status" = 'ASSIGNED' AND "runtime_binding_ref" IS NULL
  `
  if (row.relationalAssignmentId) {
    await tx.$executeRaw`
      UPDATE "relational_assessment_assignments"
      SET "status" = ${assignmentState},
          "revoked_at" = CASE WHEN ${assignmentState} = 'REVOKED' THEN ${now} ELSE "revoked_at" END,
          "updated_at" = ${now}
      WHERE "id" = ${row.relationalAssignmentId} AND "status" = 'OPEN' AND "policy_domain" = 'ORGANIZATION_RUN'
    `
  }
}

export const closeAssessmentRun = async (input: {
  organizationId: string
  runId: string
}): Promise<{ status: 'CLOSED' }> => prisma.$transaction(async (tx) => {
  const run = await lockRunEnvelope(tx, input.organizationId, input.runId)
  if (run.status === 'CLOSED') return { status: 'CLOSED' as const }
  if (run.status !== 'PUBLISHED') {
    throw new RunLifecycleError('RUN_STATE_CONFLICT', 'only a PUBLISHED Run can be closed', 409)
  }
  const executions = await lockExecutions(tx, input.runId)
  const ambiguous = executions.find((row) => (
    !row.runtimeBindingRef && (row.claimState === 'DISPATCHED' || row.claimState === 'UNKNOWN')
  ))
  if (ambiguous) {
    throw new RunLifecycleError('RUN_START_OUTCOME_UNKNOWN', 'Run has an unresolved dispatched START and cannot close safely', 409)
  }

  await tx.$executeRaw`
    UPDATE "assessment_runs"
    SET "status" = 'CLOSED', "closed_at" = transaction_timestamp(), "updated_at" = transaction_timestamp()
    WHERE "organization_id" = ${input.organizationId} AND "id" = ${input.runId} AND "status" = 'PUBLISHED'
  `
  for (const row of executions) await expireUnstarted(tx, row, 'CLOSE')
  return { status: 'CLOSED' as const }
})

export const cancelAssessmentRun = async (input: {
  organizationId: string
  runId: string
}): Promise<{ status: 'CANCELLED' }> => prisma.$transaction(async (tx) => {
  const run = await lockRunEnvelope(tx, input.organizationId, input.runId)
  if (run.status === 'CANCELLED') return { status: 'CANCELLED' as const }
  if (run.status !== 'PUBLISHED') {
    throw new RunLifecycleError('RUN_STATE_CONFLICT', 'only a PUBLISHED Run can be cancelled', 409)
  }
  const executions = await lockExecutions(tx, input.runId)
  const activeRuntime = executions.find((row) => (
    row.status !== 'COMPLETED'
    && (Boolean(row.runtimeBindingRef) || row.claimState === 'DISPATCHED' || row.claimState === 'UNKNOWN' || row.claimState === 'COMPLETED')
  ))
  if (activeRuntime) {
    throw new RunLifecycleError('RUN_CANCEL_RUNTIME_ACTIVE', 'Run contains a dispatched or bound runtime that cannot be proven safely cancelled', 409)
  }

  await tx.$executeRaw`
    UPDATE "assessment_runs"
    SET "status" = 'CANCELLED', "cancelled_at" = transaction_timestamp(), "updated_at" = transaction_timestamp()
    WHERE "organization_id" = ${input.organizationId} AND "id" = ${input.runId} AND "status" = 'PUBLISHED'
  `
  for (const row of executions) await expireUnstarted(tx, row, 'CANCEL')
  return { status: 'CANCELLED' as const }
})
