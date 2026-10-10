import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { startRelationalCompositeAttemptInTransaction } from '../composite/composite.service'
import { createSqlRelationalAssignmentRepository } from '../assessment-relational/repository'
import { createRelationalAssessmentService } from '../assessment-relational/service'
import {
  productionRunResourceAuthorityRegistry,
  type RunResourceAuthorityRegistry,
  type RunResourceFamily,
} from './resourceAuthority'
import {
  acquireRunExecutionStartClaim,
  lockExecutionEnvelope,
  markRunStartClaimCompleted,
  markRunStartDispatchIntent,
  markRunStartUnknown,
  type RunStartClaimDecision,
  type RunStartClaimRecord,
} from './startClaim'
import { loadRunExecutionStartAdmission } from './startAdmission'
import { assertCurrentRunStartAuthority } from './startAuthority'
import { freezeRunExecutionScientificProvenance, freezeRunExecutionScientificProvenanceInTransaction } from './scientificProvenance'
import {
  productionRunRuntimeAdapterRegistry,
  type RunRuntimeAdapterRegistry,
  type RunRuntimeBinding,
} from './runtimeAdapter'

type Tx = Prisma.TransactionClient

export type RunStartExecutionResult =
  | { state: 'STARTED'; runtimeBindingKind: string; runtimeBindingRef: string; replayed: boolean }
  | { state: 'IN_PROGRESS'; operationKey: string }

export class RunStartExecutionError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 409) {
    super(message)
    this.name = 'RunStartExecutionError'
  }
}

type LaunchEnvelope = {
  family: RunResourceFamily
  runtimeTargetKind: string
  runtimeTargetRef: string
}

const readLaunchEnvelope = async (db: Tx | typeof prisma, executionId: string): Promise<LaunchEnvelope> => {
  const rows = await db.$queryRaw<Array<{
    family: RunResourceFamily
    frozenResourcePolicy: unknown
  }>>`
    SELECT t."resource_family" AS "family", t."frozen_resource_policy" AS "frozenResourcePolicy"
    FROM "assessment_run_executions" e
    JOIN "assessment_run_tracks" t
      ON t."organization_id" = e."organization_id" AND t."run_id" = e."run_id" AND t."id" = e."track_id"
    WHERE e."id" = ${executionId}
    LIMIT 1
  `
  const row = rows[0]
  if (!row || !row.frozenResourcePolicy || typeof row.frozenResourcePolicy !== 'object') {
    throw new RunStartExecutionError('RUN_RESOURCE_POLICY_NOT_FROZEN', 'Run execution has no frozen resource policy', 409)
  }
  const launch = (row.frozenResourcePolicy as Record<string, any>).runtimeLaunchTarget
  if (!launch || typeof launch.kind !== 'string' || typeof launch.ref !== 'string' || !launch.ref.trim()) {
    throw new RunStartExecutionError('RUN_RUNTIME_TARGET_MISSING', 'frozen Run resource has no runtime target', 409)
  }
  return { family: row.family, runtimeTargetKind: launch.kind, runtimeTargetRef: launch.ref }
}

const attachBindingInTransaction = async (tx: Tx, input: {
  executionId: string
  claim: RunStartClaimRecord
  binding: RunRuntimeBinding
}): Promise<void> => {
  await lockExecutionEnvelope(tx, input.executionId)
  const claims = await tx.$queryRaw<Array<{ state: string; claimGeneration: number }>>`
    SELECT "state", "claim_generation" AS "claimGeneration"
    FROM "assessment_run_execution_start_claims"
    WHERE "id" = ${input.claim.id} AND "execution_id" = ${input.executionId}
    FOR UPDATE
  `
  const claim = claims[0]
  if (!claim || claim.claimGeneration !== input.claim.claimGeneration || !['DISPATCHED', 'UNKNOWN'].includes(claim.state)) {
    throw new RunStartExecutionError('RUN_START_FENCE_LOST', 'START claim ownership changed before runtime binding', 409)
  }
  const executions = await tx.$queryRaw<Array<{ relationalAssignmentId: string | null; runtimeBindingRef: string | null }>>`
    SELECT "relational_assignment_id" AS "relationalAssignmentId", "runtime_binding_ref" AS "runtimeBindingRef"
    FROM "assessment_run_executions"
    WHERE "id" = ${input.executionId}
    FOR UPDATE
  `
  const execution = executions[0]
  if (!execution) throw new RunStartExecutionError('RUN_EXECUTION_NOT_FOUND', 'Run execution not found', 404)
  if (execution.runtimeBindingRef) {
    throw new RunStartExecutionError('RUN_RUNTIME_ALREADY_BOUND', 'Run execution already has a runtime binding', 409)
  }
  if (!execution.relationalAssignmentId) {
    throw new RunStartExecutionError('RUN_ASSIGNMENT_MISSING', 'Run execution has no relational assignment', 409)
  }
  const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT transaction_timestamp() AS "now"`
  const now = nowRows[0].now
  const changed = await tx.$executeRaw`
    UPDATE "assessment_run_executions"
    SET "runtime_binding_kind" = ${input.binding.runtimeBindingKind},
        "runtime_binding_ref" = ${input.binding.runtimeBindingRef},
        "status" = 'STARTED', "started_at" = COALESCE("started_at", ${now}), "updated_at" = ${now}
    WHERE "id" = ${input.executionId} AND "runtime_binding_ref" IS NULL
  `
  if (Number(changed) !== 1) throw new RunStartExecutionError('RUN_RUNTIME_BIND_CONFLICT', 'runtime binding changed concurrently', 409)
  await tx.$executeRaw`
    UPDATE "relational_assessment_assignments"
    SET "status" = 'STARTED', "started_at" = COALESCE("started_at", ${now}), "updated_at" = ${now}
    WHERE "id" = ${execution.relationalAssignmentId} AND "status" = 'OPEN' AND "policy_domain" = 'ORGANIZATION_RUN'
  `
  await markRunStartClaimCompleted(tx, { claimId: input.claim.id, generation: input.claim.claimGeneration })
}

const startTransactionalComposite = async (input: {
  decision: Extract<RunStartClaimDecision, { kind: 'ACQUIRED' | 'RECOVER' }>
  executionId: string
  actorUserId: string
  launch: LaunchEnvelope
}): Promise<RunStartExecutionResult> => prisma.$transaction(async (tx) => {
  await lockExecutionEnvelope(tx, input.executionId)
  const claims = await tx.$queryRaw<Array<{ state: string; claimGeneration: number }>>`
    SELECT "state", "claim_generation" AS "claimGeneration"
    FROM "assessment_run_execution_start_claims"
    WHERE "id" = ${input.decision.claim.id} AND "execution_id" = ${input.executionId}
    FOR UPDATE
  `
  const claim = claims[0]
  if (!claim || claim.claimGeneration !== input.decision.claim.claimGeneration || !['CLAIMED', 'DISPATCHED'].includes(claim.state)) {
    throw new RunStartExecutionError('RUN_START_FENCE_LOST', 'START claim ownership changed before transactional dispatch', 409)
  }
  const admission = await loadRunExecutionStartAdmission({
    tx,
    executionId: input.executionId,
    actorUserId: input.actorUserId,
    admitted: true,
  })
  await freezeRunExecutionScientificProvenanceInTransaction(tx, input.executionId)

  const existing = await tx.compositeAssessmentAttempt.findFirst({
    where: { assignmentRef: admission.assignment.assignmentId },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      compositeAssessmentId: true,
      userId: true,
      subjectUserId: true,
      respondentUserId: true,
      episodeId: true,
      assignmentRef: true,
      consentId: true,
    },
  })
  if (existing) {
    if (
      existing.compositeAssessmentId !== input.launch.runtimeTargetRef
      || existing.userId !== input.actorUserId
      || existing.subjectUserId !== admission.attemptIdentity.subjectUserId
      || existing.respondentUserId !== admission.attemptIdentity.respondentUserId
      || existing.episodeId !== admission.attemptIdentity.episodeId
      || existing.assignmentRef !== admission.attemptIdentity.assignmentRef
      || existing.consentId !== admission.attemptIdentity.consentId
    ) {
      throw new RunStartExecutionError('RUN_RUNTIME_BINDING_MISMATCH', 'existing Composite runtime identity does not match frozen Run admission', 409)
    }
    if (admission.assignment.status !== 'STARTED') {
      throw new RunStartExecutionError('RUN_START_OUTCOME_UNKNOWN', 'runtime attempt exists without a STARTED Run assignment', 409)
    }
    const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT transaction_timestamp() AS "now"`
    const now = nowRows[0].now
    await tx.$executeRaw`
      UPDATE "assessment_run_execution_start_claims"
      SET "state" = 'DISPATCHED', "dispatched_at" = COALESCE("dispatched_at", ${now}), "updated_at" = ${now}
      WHERE "id" = ${input.decision.claim.id} AND "claim_generation" = ${input.decision.claim.claimGeneration}
    `
    await attachBindingInTransaction(tx, {
      executionId: input.executionId,
      claim: input.decision.claim,
      binding: { runtimeBindingKind: 'COMPOSITE', runtimeBindingRef: existing.id },
    })
    return { state: 'STARTED' as const, runtimeBindingKind: 'COMPOSITE', runtimeBindingRef: existing.id, replayed: true }
  }

  if (admission.assignment.status !== 'OPEN') {
    throw new RunStartExecutionError('RUN_START_OUTCOME_UNKNOWN', 'STARTED assignment has no authoritative runtime attempt', 409)
  }
  // A claim can be accepted while an Activity is OPEN, then wait for the
  // runtime transaction while the school pauses it or revokes a student.
  // Re-check current PR1 membership, class approval and PR2 Activity gates
  // **under the second transaction's locks** before creating any attempt.
  // Idempotent reconciliation of an already-created attempt remains above.
  await assertCurrentRunStartAuthority(tx, input.executionId)
  const state=await tx.$queryRaw<Array<{runStatus:string}>>`
    SELECT r."status" AS "runStatus"
    FROM "assessment_run_executions" e
    JOIN "assessment_runs" r ON r."id"=e."run_id"
      AND r."organization_id"=e."organization_id"
    WHERE e."id"=${input.executionId}
  `
  if(state[0]?.runStatus!=='PUBLISHED'){
    throw new RunStartExecutionError('RUN_NOT_STARTABLE','Run was closed after START claim',409)
  }
  const repository = createSqlRelationalAssignmentRepository(tx as any)
  const relational = createRelationalAssessmentService(repository)
  const started = await relational.start({ assignmentId: admission.assignment.assignmentId, actorUserId: input.actorUserId })
  const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT transaction_timestamp() AS "now"`
  const now = nowRows[0].now
  const dispatched = await tx.$executeRaw`
    UPDATE "assessment_run_execution_start_claims"
    SET "state" = 'DISPATCHED', "dispatched_at" = COALESCE("dispatched_at", ${now}), "updated_at" = ${now}
    WHERE "id" = ${input.decision.claim.id} AND "claim_generation" = ${input.decision.claim.claimGeneration}
      AND "state" IN ('CLAIMED','DISPATCHED')
  `
  if (Number(dispatched) !== 1) throw new RunStartExecutionError('RUN_START_FENCE_LOST', 'START claim fence lost before transactional runtime start', 409)
  const attempt = await startRelationalCompositeAttemptInTransaction(tx as any, {
    compositeAssessmentId: input.launch.runtimeTargetRef,
    respondentUserId: input.actorUserId,
    attemptIdentity: started.attemptIdentity,
  })
  const changed = await tx.$executeRaw`
    UPDATE "assessment_run_executions"
    SET "runtime_binding_kind" = 'COMPOSITE', "runtime_binding_ref" = ${attempt.id},
        "status" = 'STARTED', "started_at" = COALESCE("started_at", ${now}), "updated_at" = ${now}
    WHERE "id" = ${input.executionId} AND "runtime_binding_ref" IS NULL
  `
  if (Number(changed) !== 1) throw new RunStartExecutionError('RUN_RUNTIME_BIND_CONFLICT', 'runtime binding changed concurrently', 409)
  await markRunStartClaimCompleted(tx, { claimId: input.decision.claim.id, generation: input.decision.claim.claimGeneration })
  return { state: 'STARTED' as const, runtimeBindingKind: 'COMPOSITE', runtimeBindingRef: attempt.id, replayed: false }
})

const recoverOrDispatchExternal = async (input: {
  decision: Extract<RunStartClaimDecision, { kind: 'ACQUIRED' | 'RECOVER' }>
  executionId: string
  actorUserId: string
  launch: LaunchEnvelope
  runtimeAdapters: RunRuntimeAdapterRegistry
}): Promise<RunStartExecutionResult> => {
  const adapter = input.runtimeAdapters.externalFor(input.launch.runtimeTargetKind)
  if (!adapter) {
    throw new RunStartExecutionError('RUN_RUNTIME_ADAPTER_UNAVAILABLE', `no external runtime adapter for ${input.launch.runtimeTargetKind}`, 409)
  }
  await freezeRunExecutionScientificProvenance(input.executionId)
  const admission = input.decision.admission
  let claim = input.decision.claim

  const attach = async (binding: RunRuntimeBinding, replayed: boolean): Promise<RunStartExecutionResult> => {
    await prisma.$transaction((tx) => attachBindingInTransaction(tx, { executionId: input.executionId, claim, binding }))
    return { state: 'STARTED', ...binding, replayed }
  }

  if (input.decision.kind === 'RECOVER' || claim.state === 'DISPATCHED' || claim.state === 'UNKNOWN') {
    try {
      const recovered = await adapter.lookupByOperationKey(claim.operationKey)
      if (recovered) return attach(recovered, true)
    } catch {
      await markRunStartUnknown({ claimId: claim.id, generation: claim.claimGeneration })
      throw new RunStartExecutionError('RUN_START_OUTCOME_UNKNOWN', 'runtime lookup could not determine prior START outcome', 503)
    }
  }

  if (claim.state === 'CLAIMED') {
    claim = await markRunStartDispatchIntent({ claimId: claim.id, generation: claim.claimGeneration })
  }

  const request = {
    operationKey: claim.operationKey,
    runtimeTargetRef: input.launch.runtimeTargetRef,
    respondentUserId: input.actorUserId,
    attemptIdentity: admission.attemptIdentity,
    executionId: input.executionId,
  }
  try {
    return attach(await adapter.startWithOperationKey(request), false)
  } catch {
    try {
      const recovered = await adapter.lookupByOperationKey(claim.operationKey)
      if (recovered) return attach(recovered, true)
      // Authoritative NOT_FOUND permits exactly one safe redispatch with the same key.
      return attach(await adapter.startWithOperationKey(request), true)
    } catch {
      await markRunStartUnknown({ claimId: claim.id, generation: claim.claimGeneration })
      throw new RunStartExecutionError('RUN_START_OUTCOME_UNKNOWN', 'runtime START outcome is unknown; blind retry is forbidden', 503)
    }
  }
}

export const startAssessmentRunExecution = async (input: {
  executionId: string
  actorUserId: string
  resourceRegistry?: RunResourceAuthorityRegistry
  runtimeAdapters?: RunRuntimeAdapterRegistry
}): Promise<RunStartExecutionResult> => {
  const decision = await acquireRunExecutionStartClaim({ executionId: input.executionId, actorUserId: input.actorUserId, resourceRegistry: input.resourceRegistry })
  if (decision.kind === 'BOUND') {
    return {
      state: 'STARTED',
      runtimeBindingKind: decision.runtimeBindingKind,
      runtimeBindingRef: decision.runtimeBindingRef,
      replayed: true,
    }
  }
  if (decision.kind === 'IN_PROGRESS') return { state: 'IN_PROGRESS', operationKey: decision.claim.operationKey }
  if (decision.kind === 'ABORTED') throw new RunStartExecutionError('RUN_START_ABORTED', 'Run START was aborted by lifecycle arbitration', 409)

  const launch = await readLaunchEnvelope(prisma, input.executionId)
  const resourceRegistry = input.resourceRegistry ?? productionRunResourceAuthorityRegistry
  const resourceAdapter = resourceRegistry.assertStartSupported(launch.family)
  if (resourceAdapter.capabilities.transactionMode === 'TRANSACTIONAL_DB') {
    if (launch.runtimeTargetKind !== 'COMPOSITE') {
      throw new RunStartExecutionError('RUN_RUNTIME_TARGET_UNSUPPORTED', 'transactional Run adapter supports Composite runtime only', 409)
    }
    return startTransactionalComposite({ decision, executionId: input.executionId, actorUserId: input.actorUserId, launch })
  }
  return recoverOrDispatchExternal({
    decision,
    executionId: input.executionId,
    actorUserId: input.actorUserId,
    launch,
    runtimeAdapters: input.runtimeAdapters ?? productionRunRuntimeAdapterRegistry,
  })
}
