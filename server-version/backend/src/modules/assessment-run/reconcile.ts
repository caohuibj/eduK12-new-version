import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'

export class RunReconciliationError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 409) {
    super(message)
    this.name = 'RunReconciliationError'
  }
}

type Tx = Prisma.TransactionClient

export type RunReconciliationResult =
  | { state: 'COMPLETED'; completedAt: Date; replayed: boolean }
  | { state: 'IN_PROGRESS' }
  | { state: 'NOT_STARTED' }

export const reconcileRunExecutionFromRuntimeInTransaction = async (
  tx: Tx,
  executionId: string,
): Promise<RunReconciliationResult> => {
  const rows = await tx.$queryRaw<Array<{
    status: string
    completedAt: Date | null
    relationalAssignmentId: string | null
    runtimeBindingKind: string | null
    runtimeBindingRef: string | null
  }>>`
    SELECT "status", "completed_at" AS "completedAt", "relational_assignment_id" AS "relationalAssignmentId",
      "runtime_binding_kind" AS "runtimeBindingKind", "runtime_binding_ref" AS "runtimeBindingRef"
    FROM "assessment_run_executions"
    WHERE "id" = ${executionId}
    FOR UPDATE
  `
  const execution = rows[0]
  if (!execution) throw new RunReconciliationError('RUN_EXECUTION_NOT_FOUND', 'Run execution not found', 404)
  if (execution.status === 'COMPLETED' && execution.completedAt) {
    return { state: 'COMPLETED', completedAt: execution.completedAt, replayed: true }
  }
  if (!execution.runtimeBindingKind || !execution.runtimeBindingRef) return { state: 'NOT_STARTED' }
  if (execution.runtimeBindingKind !== 'COMPOSITE') {
    throw new RunReconciliationError('RUN_RUNTIME_RECONCILER_UNAVAILABLE', `no authoritative reconciler for ${execution.runtimeBindingKind}`, 409)
  }

  const attempts = await tx.$queryRaw<Array<{
    status: string
    completedAt: Date | null
    assignmentRef: string | null
  }>>`
    SELECT "status", "completed_at" AS "completedAt", "assignment_ref" AS "assignmentRef"
    FROM "composite_assessment_attempts"
    WHERE "id" = ${execution.runtimeBindingRef}
    FOR UPDATE
  `
  const attempt = attempts[0]
  if (!attempt) throw new RunReconciliationError('RUN_RUNTIME_BINDING_MISSING', 'bound Composite runtime attempt no longer exists', 409)
  if (attempt.assignmentRef !== execution.relationalAssignmentId) {
    throw new RunReconciliationError('RUN_RUNTIME_BINDING_MISMATCH', 'runtime assignment identity does not match Run execution', 409)
  }
  if (attempt.status !== 'COMPLETED') return { state: 'IN_PROGRESS' }
  if (!attempt.completedAt) {
    throw new RunReconciliationError('RUN_RUNTIME_COMPLETION_INVALID', 'COMPLETED runtime attempt has no completion timestamp', 500)
  }
  if (!execution.relationalAssignmentId) {
    throw new RunReconciliationError('RUN_ASSIGNMENT_MISSING', 'Run execution has no relational assignment', 409)
  }

  const changed = await tx.$executeRaw`
    UPDATE "assessment_run_executions"
    SET "status" = 'COMPLETED', "completed_at" = ${attempt.completedAt}, "updated_at" = transaction_timestamp()
    WHERE "id" = ${executionId} AND "status" <> 'COMPLETED'
  `
  if (Number(changed) !== 1) throw new RunReconciliationError('RUN_RECONCILIATION_CONFLICT', 'Run completion changed concurrently', 409)
  await tx.$executeRaw`
    UPDATE "relational_assessment_assignments"
    SET "status" = 'COMPLETED', "completed_at" = ${attempt.completedAt}, "updated_at" = transaction_timestamp()
    WHERE "id" = ${execution.relationalAssignmentId} AND "status" = 'STARTED' AND "policy_domain" = 'ORGANIZATION_RUN'
  `
  return { state: 'COMPLETED', completedAt: attempt.completedAt, replayed: false }
}

export const reconcileRunExecutionFromRuntime = (
  executionId: string,
): Promise<RunReconciliationResult> => prisma.$transaction((tx) => (
  reconcileRunExecutionFromRuntimeInTransaction(tx, executionId)
))

export const reconcileRunExecutionByRuntimeBinding = async (input: {
  runtimeBindingKind: string
  runtimeBindingRef: string
}): Promise<RunReconciliationResult | null> => {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "assessment_run_executions"
    WHERE "runtime_binding_kind" = ${input.runtimeBindingKind}
      AND "runtime_binding_ref" = ${input.runtimeBindingRef}
    LIMIT 1
  `
  return rows[0] ? reconcileRunExecutionFromRuntime(rows[0].id) : null
}
