import {assertEducationAssessmentExecutionSource} from './educationAssessmentExecution'
import {readPrivateFormExecutionSource} from './educationPrivateFormExecution'
import {admitCompositionStart,lockCompositionStartLibraryUses} from './educationCompositionExecution'
import {assertEducationLibraryUses} from '../education-tools/library-source.use'
import { assertEducationLibraryExecutionSource } from './educationLibraryExecution'
import {assertTrainingPrivateReferenceAdmissionCurrent} from '../composite/training-private-reference-use'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../config/database'
import { classifyStartTransaction, isAssessmentStartBusyError, AssessmentStartBusyError, rolledBackStartReason, rethrowGateBusyAsStartBusy, START_INTERACTIVE_TRANSACTION } from '../composite/start-transient'
import { BoundedAdmissionGate, configuredInteger } from '../../services/boundedAdmissionGate'
import { reportForegroundGateQueueDepth } from '../../services/wholeSubmissionPriority'
import { defaultRunStartAdmissionBound } from '../../config/databasePool'
import { buildWholeStartPreload, startRelationalCompositeAttemptInTransaction } from '../composite/composite.service'
import type { RunStartPreflight } from './resourceBoundary'
import {
  admitPrecompiledScaleCompositionStart,
  awaitScaleCompositionStartResources,
  isAssessmentStartCpuPaused,
  isAssessmentRunStartCpuPaused,
  isAssessmentStartResourceGateError,
  isAssessmentStartResourceConstrained,
  runWithLowMemoryTrickleAdmission,
  withAdmittedScaleCompositionStart,
} from '../../services/assessmentResourceProtection'
import { traceAssessmentPhase } from '../../services/runtimeObservability'
import {resolvePublishedTeacherForm,teacherFormResourceRef,
  TEACHER_FORM_RUNTIME_KIND} from '../huiteacher/formRunResource'
import {studentFormResourceId,assertStudentFormRunUse} from '../huiteacher/studentFormResource'
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
  toStartAuthorityKnownEnvelope,
  markRunStartClaimCompleted,
  markRunStartDispatchIntent,
  markRunStartUnknown,
  releaseRolledBackRunStartClaim,
  resolveProductScopeFromLock,
  RunStartClaimError,
  type RunStartClaimDecision,
  type RunStartClaimRecord,
  type TransactionalStartDispatchContext,
} from './startClaim'
import { loadRunExecutionStartAdmission } from './startAdmission'
import { assertCurrentRunStartAuthority, assertPublishedSelfWholeStartAuthority } from './startAuthority'
import { freezeRunExecutionScientificProvenance, freezeRunExecutionScientificProvenanceInTransaction, prepareCompositionScientificProvenance } from './scientificProvenance'
import {
  productionRunRuntimeAdapterRegistry,
  type RunRuntimeAdapterRegistry,
  type RunRuntimeBinding,
} from './runtimeAdapter'

type Tx = Prisma.TransactionClient

type CommittedCompositionStart = { executionId: string; actorUserId: string; attemptId: string; consentFree: boolean }

export type RunStartExecutionResult =
  | { state: 'STARTED'; runtimeBindingKind: string; runtimeBindingRef: string; replayed: boolean
      _committedCompositionStart?: CommittedCompositionStart }
  | { state: 'IN_PROGRESS'; operationKey: string }

export class RunStartExecutionError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 409) {
    super(message)
    this.name = 'RunStartExecutionError'
  }
}

const resolveBound = (
  explicitName: string,
  fallbackName: string,
  defaultVal: number,
  allowZero = false,
): number => {
  const explicitRaw = process.env[explicitName]
  if (explicitRaw !== undefined && explicitRaw.trim() !== '') {
    return configuredInteger(explicitName, defaultVal, allowZero)
  }
  const fallbackRaw = process.env[fallbackName]
  if (fallbackRaw !== undefined && fallbackRaw.trim() !== '') {
    return configuredInteger(fallbackName, defaultVal, allowZero)
  }
  return defaultVal
}

let runStartGateInstance: BoundedAdmissionGate | null = null

export const resetRunStartGateForTests = (): void => {
  runStartGateInstance = null
}

export const runStartGate = (): BoundedAdmissionGate => {
  if (!runStartGateInstance) {
    const defaultConcurrent = defaultRunStartAdmissionBound(process.env.DATABASE_URL)
    const maxConcurrent = resolveBound(
      'RUN_START_MAX_CONCURRENT',
      'TRAINING_START_MAX_CONCURRENT',
      defaultConcurrent,
      false,
    )
    const maxQueue = resolveBound(
      'RUN_START_MAX_QUEUE',
      'TRAINING_START_MAX_QUEUE',
      300,
      true,
    )
    const maxWaitMs = resolveBound(
      'RUN_START_MAX_WAIT_MS',
      'TRAINING_START_MAX_WAIT_MS',
      15000,
      false,
    )

    runStartGateInstance = new BoundedAdmissionGate({
      name: 'run_start_admission',
      maxConcurrent,
      maxQueue,
      maxWaitMs,
      retryAfterSeconds: 1,
      busyCode: 'ASSESSMENT_START_BUSY',
      busyMessage: '测评开始请求繁忙，请稍后重试',
      onStateChange: (_active, queued) => reportForegroundGateQueueDepth('run_start_admission', queued),
    })
  }
  return runStartGateInstance
}

type LaunchEnvelope = {
  family: RunResourceFamily
  resourceKey:string
  runtimeTargetKind: string
  runtimeTargetRef: string
}

const parseLaunchEnvelopeFromTrack = (row: {
  family: RunResourceFamily
  resourceKey: string
  frozenResourcePolicy: unknown
} | undefined): LaunchEnvelope => {
  if (!row || !row.frozenResourcePolicy || typeof row.frozenResourcePolicy !== 'object') {
    throw new RunStartExecutionError('RUN_RESOURCE_POLICY_NOT_FROZEN', 'Run execution has no frozen resource policy', 409)
  }
  const launch = (row.frozenResourcePolicy as Record<string, any>).runtimeLaunchTarget
  if (!launch || typeof launch.kind !== 'string' || typeof launch.ref !== 'string' || !launch.ref.trim()) {
    throw new RunStartExecutionError('RUN_RUNTIME_TARGET_MISSING', 'frozen Run resource has no runtime target', 409)
  }
  return { family: row.family, resourceKey: row.resourceKey, runtimeTargetKind: launch.kind, runtimeTargetRef: launch.ref }
}

const readLaunchEnvelope = async (db: Tx | typeof prisma, executionId: string): Promise<LaunchEnvelope> => {
  const rows = await db.$queryRaw<Array<{
    family: RunResourceFamily
    resourceKey:string
    frozenResourcePolicy: unknown
  }>>`
    SELECT t."resource_family" AS "family",t."resource_key" AS "resourceKey", t."frozen_resource_policy" AS "frozenResourcePolicy"
    FROM "assessment_run_executions" e
    JOIN "assessment_run_tracks" t
      ON t."organization_id" = e."organization_id" AND t."run_id" = e."run_id" AND t."id" = e."track_id"
    WHERE e."id" = ${executionId}
    LIMIT 1
  `
  return parseLaunchEnvelopeFromTrack(rows[0])
}

const attachBindingInTransaction = async (tx: Tx, input: {
  executionId: string
  claim: RunStartClaimRecord
  binding: RunRuntimeBinding
  alreadyLocked?: boolean
  now?: Date
}): Promise<void> => {
  if (!input.alreadyLocked) {
    await lockExecutionEnvelope(tx, input.executionId, {
      organizationId: input.claim.organizationId,
      runId: input.claim.runId,
    })
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
  const now = input.now ?? (await tx.$queryRaw<Array<{ now: Date }>>`SELECT transaction_timestamp() AS "now"`)[0].now
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
  await markRunStartClaimCompleted(tx, { claimId: input.claim.id, generation: input.claim.claimGeneration, now })
}

/** The runtime dispatch transaction rolled back with a known-safe outcome:
 * nothing from this attempt committed, but the first transaction's CLAIMED
 * row still holds its lease. Shorten that undispatched claim's lease so the
 * next request takes over through the existing generation CAS immediately.
 * If even this single-statement release cannot run (e.g. the pool is still
 * saturated), keep the original lease and report the real remaining wait. */
const releaseClaimAfterRolledBackDispatch = async (
  claim: RunStartClaimRecord,
  err: AssessmentStartBusyError,
): Promise<Error> => {
  const released = await releaseRolledBackRunStartClaim({
    claimId: claim.id,
    executionId: claim.executionId,
    generation: claim.claimGeneration,
  })
  if (released) return err
  const remainingMs = claim.leaseUntil.getTime() - Date.now()
  if (!(remainingMs > 0)) return err
  return new AssessmentStartBusyError(err.reason, Math.min(Math.ceil(remainingMs / 1000), 30))
}

const executeTransactionalCompositeInTx = async (tx: Tx, input: {
  decision: Extract<RunStartClaimDecision, { kind: 'ACQUIRED' | 'RECOVER' }>
  executionId: string
  actorUserId: string
  launch: LaunchEnvelope
  preloadedComposite?: any
  inlineContext?: TransactionalStartDispatchContext
  admittedScaleBatch?: boolean
}): Promise<RunStartExecutionResult> => {
  const inline = Boolean(input.inlineContext)
  const libraryUses = inline
    ? input.inlineContext!.compositionSources
    : input.launch.resourceKey.startsWith('education-composition:') ? await lockCompositionStartLibraryUses(tx, input) : undefined
  const envelope = inline
    ? input.inlineContext!.execution
    : await lockExecutionEnvelope(tx, input.executionId, {
        organizationId: input.decision.claim.organizationId,
        runId: input.decision.claim.runId,
      })
  const productScope = inline
    ? input.inlineContext!.productScope
    : resolveProductScopeFromLock(envelope)
  if (!inline) {
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
  }
  const admission = inline
    ? input.inlineContext!.admission
    : input.decision.kind === 'ACQUIRED'
    ? input.decision.admission
    : await loadRunExecutionStartAdmission({
        tx,
        executionId: input.executionId,
        actorUserId: input.actorUserId,
        admitted: true,
        admittedAttemptIdentity: input.decision.claim.admittedAttemptIdentity,
        knownExecution: envelope,
      })
  // Claim tx already froze provenance on first START. Skip the freeze
  // SELECT+early-return when the locked execution row is already frozen;
  // recovered pre-freeze claims still backfill below.
  if (!inline && !envelope?.scientificFrozenAt) {
    await freezeRunExecutionScientificProvenanceInTransaction(tx, input.executionId)
  }

  const inlineIntake = input.inlineContext?.publishedSelfIntake
  const existing = inlineIntake ? inlineIntake.existingAttempt : await tx.compositeAssessmentAttempt.findFirst({
    where: { assignmentRef: admission.assignment.assignmentId },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      compositeAssessmentId: true,
      userId: true,
      subjectUserId: true,
      respondentUserId: true,
      respondentType: true,
      episodeId: true,
      assignmentRef: true,
      consentId: true,
    },
  })
  // Decision D-4 (2026-11-06, product-confirmed): replay of an existing
  // attempt is EXEMPT from the governance recheck that the new-attempt branch
  // below performs (assertCurrentRunStartAuthority + Run PUBLISHED). The only
  // gates here are the frozen-identity match and a STARTED assignment; a
  // revocation or Run CLOSE committed after the attempt was created does not
  // change the outcome. The exemption scope is exactly this branch: a fresh
  // claim for the same execution still re-checks authority.
  if (existing) {
    if (
      existing.compositeAssessmentId !== input.launch.runtimeTargetRef
      || existing.userId !== input.actorUserId
      || existing.subjectUserId !== admission.attemptIdentity.subjectUserId
      || existing.respondentUserId !== admission.attemptIdentity.respondentUserId
      || existing.respondentType !== admission.attemptIdentity.respondentType
      || existing.episodeId !== admission.attemptIdentity.episodeId
      || existing.assignmentRef !== admission.attemptIdentity.assignmentRef
      || existing.consentId !== admission.attemptIdentity.consentId
    ) {
      throw new RunStartExecutionError('RUN_RUNTIME_BINDING_MISMATCH', 'existing Composite runtime identity does not match frozen Run admission', 409)
    }
    if (admission.assignment.status !== 'STARTED') {
      throw new RunStartExecutionError('RUN_START_OUTCOME_UNKNOWN', 'runtime attempt exists without a STARTED Run assignment', 409)
    }
    const now = input.inlineContext?.now ?? envelope?.txNow
      ?? (await tx.$queryRaw<Array<{ now: Date }>>`SELECT transaction_timestamp() AS "now"`)[0].now
    await tx.$executeRaw`
      UPDATE "assessment_run_execution_start_claims"
      SET "state" = 'DISPATCHED', "dispatched_at" = COALESCE("dispatched_at", ${now}), "updated_at" = ${now}
      WHERE "id" = ${input.decision.claim.id} AND "claim_generation" = ${input.decision.claim.claimGeneration}
    `
    await attachBindingInTransaction(tx, {
      executionId: input.executionId,
      claim: input.decision.claim,
      binding: { runtimeBindingKind: 'COMPOSITE', runtimeBindingRef: existing.id },
      alreadyLocked: inline,
      now,
    })
    return { state: 'STARTED' as const, runtimeBindingKind: 'COMPOSITE', runtimeBindingRef: existing.id, replayed: true }
  }

  if (admission.assignment.status !== 'OPEN') {
    throw new RunStartExecutionError('RUN_START_OUTCOME_UNKNOWN', 'STARTED assignment has no authoritative runtime attempt', 409)
  }
  // When executing in a separate second transaction, re-check current PR1/PR2
  // gates under TX2's locks; inline single-transaction dispatch already holds
  // those exact locks and verified current authority in acquireRunExecutionStartClaim.
  const knownEnvelope = envelope?.trackResourceKey?.startsWith('education-composition:')
    ? toStartAuthorityKnownEnvelope(envelope) : undefined
  const publishedSelfWhole = Boolean(inline ? inlineIntake
    : await assertPublishedSelfWholeStartAuthority(tx, knownEnvelope, productScope, admission.assignment.assignmentId))
  if (!inline && !publishedSelfWhole) {
    await assertCurrentRunStartAuthority(tx, input.executionId, {
      accountMode: 'DETECT_EDUCATION_LIBRARY',
      productScope,
      knownEnvelope,
    })
  }
  if (admission.assignment.resourceKey.startsWith('library-scale:')||admission.assignment.resourceKey.startsWith('private-scale:')) {
    const inlineTrack = input.inlineContext?.scientificDetails?.track
    const knownInTx = inlineTrack
      && inlineTrack.resourceFamily === 'SCALE'
      && inlineTrack.frozenResourcePolicy
      && typeof inlineTrack.frozenResourcePolicy === 'object'
      && typeof inlineTrack.resourcePolicyHash === 'string'
      && admission.assignment.policyDomain === 'ORGANIZATION_RUN'
      && admission.assignment.resourceKind === inlineTrack.resourceFamily
      && admission.assignment.resourceKey === inlineTrack.resourceKey
      && admission.assignment.resourceVersion === inlineTrack.resourceVersion
      ? {
          organizationId: inlineTrack.organizationId,
          key: inlineTrack.resourceKey,
          version: inlineTrack.resourceVersion,
          policy: inlineTrack.frozenResourcePolicy as any,
          policyHash: inlineTrack.resourcePolicyHash,
          school: inlineTrack.school,
          teacher: inlineTrack.teacher,
          subjectRole: admission.assignment.subjectRole,
          respondentRole: admission.assignment.respondentRole,
          relationship: admission.assignment.relationshipKind,
          source: input.inlineContext?.scientificDetails?.educationScaleSource,
        }
      : undefined
    await assertEducationLibraryExecutionSource(tx, {
      executionId: input.executionId,
      compositeId: input.launch.runtimeTargetRef,
      knownInTx,
    })
  }
  const educationSource=admission.assignment.resourceKey.startsWith('education-assessment:')?await assertEducationAssessmentExecutionSource(tx,{executionId:input.executionId,compositeId:input.launch.runtimeTargetRef,purpose:'NEW_START'}):undefined
  const knownSelfSource = publishedSelfWhole && envelope?.trackReceiptOnly !== undefined && (productScope === 'CAMPUS_ONLY' || productScope === 'HUITEACHER_ONLY')
    ? {
        product: productScope === 'CAMPUS_ONLY' ? 'SCHOOL' as const : 'TEACHER' as const,
        assignmentRef: admission.assignment.assignmentId,
        subjectUserId: admission.assignment.subjectUserId,
        respondentUserId: admission.assignment.respondentUserId,
        receiptOnly: Boolean(envelope.trackReceiptOnly),
      }
    : undefined
  const compositionStart=admission.assignment.resourceKey.startsWith('education-composition:')?await admitCompositionStart(tx,{
    executionId:input.executionId,compositeId:input.launch.runtimeTargetRef,actorUserId:input.actorUserId},libraryUses?.uses,
    input.inlineContext?.scientificDetails?.compositionIdentity,publishedSelfWhole,knownSelfSource):undefined
  if(admission.assignment.resourceKey.startsWith('private-form:'))await readPrivateFormExecutionSource(tx,{executionId:input.executionId,compositeId:input.launch.runtimeTargetRef,actorUserId:input.actorUserId})
  // assessment_runs is already SHARE-locked by lockExecutionEnvelope, and
  // admission just projected r.status under that fence. A second SELECT
  // cannot observe a newer CLOSE.
  if((envelope?.runStatus ?? admission.execution.runStatus)!=='PUBLISHED'){
    throw new RunStartExecutionError('RUN_NOT_STARTABLE','Run was closed after START claim',409)
  }
  const repository = createSqlRelationalAssignmentRepository(tx as any)
  const relational = createRelationalAssessmentService(repository)
  const started = await relational.start({
    assignmentId: admission.assignment.assignmentId,
    actorUserId: input.actorUserId,
    ...(inline ? { knownAssignment: admission.assignment, acceptedConsentInTransaction: admission.acceptedConsent } : {}),
  })
  // The claim freezes runtime identity before this transaction. The relational
  // transition still checks current assignment/consent authority, but its legacy
  // occupational respondent mapping must not replace that admitted identity.
  // Decision D-5 (2026-11-06, product-confirmed): consent is frozen at claim
  // time and stays valid for the whole START flow. relational.start resolves
  // the CURRENT accepted consent, which may differ from the frozen one after
  // a re-consent; that difference is deliberately NOT a mismatch. The attempt
  // below is created with the frozen admission identity, so replay and new
  // attempt both run under the frozen consent.
  for (const key of ['subjectUserId', 'respondentUserId', 'episodeId', 'assignmentRef'] as const) {
    if (started.attemptIdentity[key] !== admission.attemptIdentity[key]) {
      throw new RunStartExecutionError('RUN_RUNTIME_BINDING_MISMATCH', 'current assignment or consent differs from frozen Run admission', 409)
    }
  }
  const now = input.inlineContext?.now ?? envelope?.txNow
    ?? (await tx.$queryRaw<Array<{ now: Date }>>`SELECT transaction_timestamp() AS "now"`)[0].now
  if (!inline) {
    const dispatched = await tx.$executeRaw`
      UPDATE "assessment_run_execution_start_claims"
      SET "state" = 'DISPATCHED', "dispatched_at" = COALESCE("dispatched_at", ${now}), "updated_at" = ${now}
      WHERE "id" = ${input.decision.claim.id} AND "claim_generation" = ${input.decision.claim.claimGeneration}
        AND "state" IN ('CLAIMED','DISPATCHED')
    `
    if (Number(dispatched) !== 1) throw new RunStartExecutionError('RUN_START_FENCE_LOST', 'START claim fence lost before transactional runtime start', 409)
  }
  let preloadedComposite = input.preloadedComposite
  if (!preloadedComposite && typeof (tx as any)?.compositeAssessment?.findUnique === 'function') {
    const compositeModule = await import('../composite/composite.service')
    if (typeof compositeModule.loadStartComposite === 'function') {
      preloadedComposite = await compositeModule.loadStartComposite(input.launch.runtimeTargetRef, tx as any)
    }
  }
  const createRuntime = () => startRelationalCompositeAttemptInTransaction(tx as any, {
    compositeAssessmentId: input.launch.runtimeTargetRef,
    respondentUserId: input.actorUserId,
    attemptIdentity: admission.attemptIdentity,
    educationStart: compositionStart??educationSource?.startProof,
    preloadedComposite,
    knownNoExistingAssignmentAttempt: true,
  })
  const units = preloadedComposite?.items as { type: string; required: boolean }[] | undefined
  const attempt = input.admittedScaleBatch && compositionStart && !preloadedComposite?.formSections?.length && units?.length
    && units.every(unit => unit.required && unit.type === 'SCALE')
    ? await withAdmittedScaleCompositionStart(createRuntime) : await createRuntime()
  if (inline) {
    // Coalesce execution binding + inline claim completion into one roundtrip.
    const boundRows = await tx.$queryRaw<Array<{ execChanged: number; claimChanged: number }>>`
      WITH updated_exec AS (
        UPDATE "assessment_run_executions"
        SET "runtime_binding_kind" = 'COMPOSITE', "runtime_binding_ref" = ${attempt.id},
            "status" = 'STARTED', "started_at" = COALESCE("started_at", ${now}), "updated_at" = ${now}
        WHERE "id" = ${input.executionId} AND "runtime_binding_ref" IS NULL
        RETURNING "id"
      ),
      updated_claim AS (
        UPDATE "assessment_run_execution_start_claims"
        SET "state" = 'COMPLETED',
            "dispatched_at" = COALESCE("dispatched_at", ${now}),
            "completed_at" = ${now},
            "unknown_at" = NULL,
            "updated_at" = ${now}
        WHERE "id" = ${input.decision.claim.id}
          AND "claim_generation" = ${input.decision.claim.claimGeneration}
          AND "state" IN ('CLAIMED', 'DISPATCHED', 'UNKNOWN')
          AND EXISTS (SELECT 1 FROM updated_exec)
        RETURNING "id"
      )
      SELECT
        (SELECT count(*)::int FROM updated_exec) AS "execChanged",
        (SELECT count(*)::int FROM updated_claim) AS "claimChanged"
    `
    const bound = boundRows[0]
    if (!bound || bound.execChanged !== 1) throw new RunStartExecutionError('RUN_RUNTIME_BIND_CONFLICT', 'runtime binding changed concurrently', 409)
    if (bound.claimChanged !== 1) throw new RunStartClaimError('RUN_START_FENCE_LOST', 'START claim fence lost before completion', 409)
  } else {
    const changed = await tx.$executeRaw`
      UPDATE "assessment_run_executions"
      SET "runtime_binding_kind" = 'COMPOSITE', "runtime_binding_ref" = ${attempt.id},
          "status" = 'STARTED', "started_at" = COALESCE("started_at", ${now}), "updated_at" = ${now}
      WHERE "id" = ${input.executionId} AND "runtime_binding_ref" IS NULL
    `
    if (Number(changed) !== 1) throw new RunStartExecutionError('RUN_RUNTIME_BIND_CONFLICT', 'runtime binding changed concurrently', 409)
    await markRunStartClaimCompleted(tx, { claimId: input.decision.claim.id, generation: input.decision.claim.claimGeneration, now, allowClaimedInline: inline })
  }
  await assertTrainingPrivateReferenceAdmissionCurrent(tx)
  if(libraryUses&&!publishedSelfWhole)await assertEducationLibraryUses(tx,libraryUses.context,libraryUses.entryIds,{locked:libraryUses.uses,requireLocked:true})
  const result: RunStartExecutionResult = {
    state: 'STARTED',
    runtimeBindingKind: 'COMPOSITE',
    runtimeBindingRef: attempt.id,
    replayed: false,
  }
  // A committed Run START may reuse an earlier attempt even when its Run binding
  // was missing. replayed:false alone does not establish a new Whole attempt.
  Object.defineProperty(result, '_freshlyCreatedAttempt', {
    value: (attempt as { _freshlyCreatedAttempt?: boolean })._freshlyCreatedAttempt === true,
  })
  if (inline && compositionStart) {
    Object.defineProperty(result, '_committedCompositionStart', {
      value: {
        executionId: input.executionId, actorUserId: input.actorUserId, attemptId: attempt.id,
        consentFree: admission.assignment.consentId === null && admission.attemptIdentity.consentId === null
          && admission.assignment.respondentRole !== 'PARENT' && !admission.assignment.visibilityPolicyKey.startsWith('observer_'),
      } satisfies CommittedCompositionStart,
    })
  }
  const sourceComposite = (attempt as any)._startComposite
  const children = (attempt as any)._freshScaleChildren as object[] | undefined
  if (sourceComposite) {
    // A fresh single Scale still activates admission at current-unit delivery.
    Object.defineProperty(result, '_educationWholePreload', {
      value: buildWholeStartPreload(attempt, children, sourceComposite, children?.length !== 1),
    })
  }
  return result
}

const startTransactionalComposite = async (input: {
  decision: Extract<RunStartClaimDecision, { kind: 'ACQUIRED' | 'RECOVER' }>
  executionId: string
  actorUserId: string
  launch: LaunchEnvelope
  preloadedComposite?: any
}): Promise<RunStartExecutionResult> => {
  try {
    return await classifyStartTransaction(() =>
      prisma.$transaction((tx) => executeTransactionalCompositeInTx(tx, input), START_INTERACTIVE_TRANSACTION),
    )
  } catch (err) {
    if (!isAssessmentStartBusyError(err)) throw err
    throw await releaseClaimAfterRolledBackDispatch(input.decision.claim, err)
  }
}

/**
 * The existing Run CLAIM/Admission/Provenance contract is authoritative.
 * This is a transactional FORM V2 runtime adapter, not a Survey Researcher
 * attempt, a Composite Form-section approximation, or a second assignment.
 */
const executeTransactionalTeacherFormInTx = async (tx: Tx, input: {
  decision: Extract<RunStartClaimDecision, { kind: 'ACQUIRED' | 'RECOVER' }>
  executionId: string
  actorUserId: string
  launch: LaunchEnvelope
  inlineContext?: TransactionalStartDispatchContext
}): Promise<RunStartExecutionResult> => {
  const inline = Boolean(input.inlineContext)
  const envelope = inline
    ? input.inlineContext!.execution
    : await lockExecutionEnvelope(tx, input.executionId, {
        organizationId: input.decision.claim.organizationId,
        runId: input.decision.claim.runId,
      })
  const productScope = inline
    ? input.inlineContext!.productScope
    : resolveProductScopeFromLock(envelope)
  if (!inline) {
    const rows=await tx.$queryRaw<Array<{state:string;claimGeneration:number}>>`
      SELECT "state","claim_generation" AS "claimGeneration"
      FROM "assessment_run_execution_start_claims"
      WHERE "id"=${input.decision.claim.id} AND "execution_id"=${input.executionId}
      FOR UPDATE
    `
    const claim=rows[0]
    if(!claim||claim.claimGeneration!==input.decision.claim.claimGeneration
      ||!['CLAIMED','DISPATCHED'].includes(claim.state))
      throw new RunStartExecutionError('RUN_START_FENCE_LOST','Teacher Form START ownership changed',409)
  }
  const admission = inline
    ? input.inlineContext!.admission
    : await loadRunExecutionStartAdmission({
        tx,executionId:input.executionId,
        actorUserId:input.actorUserId,admitted:true,
        admittedAttemptIdentity:input.decision.claim.admittedAttemptIdentity,
        knownExecution:envelope,
      })
  if(!inline && !envelope?.scientificFrozenAt){
    await freezeRunExecutionScientificProvenanceInTransaction(tx,input.executionId)
  }

  const existing=await tx.huiteacherFormAttempt.findUnique({
    where:{runExecutionId:input.executionId},
  })
  const frozen=(await tx.$queryRaw<Array<{key:string;version:string}>>`
    SELECT track."resource_key" AS "key",track."resource_version" AS "version"
    FROM "assessment_run_executions" execution
    JOIN "assessment_run_tracks" track
      ON track."organization_id"=execution."organization_id"
      AND track."run_id"=execution."run_id"
      AND track."id"=execution."track_id"
    WHERE execution."id"=${input.executionId} LIMIT 1
  `)[0]
  if(!frozen)throw new RunStartExecutionError('RUN_FROZEN_FORM_MISSING','form track not available',409)
  const studentRef={family:'FORM' as const,key:frozen.key,version:frozen.version}
  const studentFormId=studentFormResourceId(studentRef)
  if(studentFormId){
    if(studentFormId!==input.launch.runtimeTargetRef)
      throw new RunStartExecutionError('RUN_FROZEN_FORM_MISMATCH','student form launch mismatch',409)
    await assertStudentFormRunUse(tx,{organizationId:admission.execution.organizationId,
      runId:admission.execution.runId,ref:studentRef})
  }else if(frozen.key!=='huiteacher-form:'+input.launch.runtimeTargetRef){
    throw new RunStartExecutionError('RUN_FROZEN_FORM_MISMATCH','teacher form launch mismatch',409)
  }
  const expectedRef=teacherFormResourceRef(input.launch.runtimeTargetRef,frozen.version)
  const form=await resolvePublishedTeacherForm(expectedRef,tx)
  if(form.organizationId!==admission.execution.organizationId)
    throw new RunStartExecutionError('RUN_CROSS_PRODUCT_FORM','Teacher Form does not belong to current school',403)
  if(existing){
    if(existing.formId!==form.id||existing.definitionDigest!==form.definitionDigest
      ||existing.respondentUserId!==input.actorUserId
      ||existing.organizationId!==admission.execution.organizationId
      ||existing.runId!==admission.execution.runId
      ||admission.assignment.status!=='STARTED')
      throw new RunStartExecutionError('RUN_RUNTIME_BINDING_MISMATCH','Teacher Form START identity mismatch',409)
    const nowRows=await tx.$queryRaw<Array<{now:Date}>>`SELECT transaction_timestamp() AS "now"`
    await tx.$executeRaw`
      UPDATE "assessment_run_execution_start_claims"
      SET "state"='DISPATCHED',
        "dispatched_at"=COALESCE("dispatched_at",${nowRows[0].now}),
        "updated_at"=${nowRows[0].now}
      WHERE "id"=${input.decision.claim.id}
        AND "claim_generation"=${input.decision.claim.claimGeneration}
    `
    await attachBindingInTransaction(tx,{
      executionId:input.executionId,claim:input.decision.claim,
      binding:{runtimeBindingKind:TEACHER_FORM_RUNTIME_KIND,runtimeBindingRef:existing.id},
      alreadyLocked:inline,
    })
    return {state:'STARTED' as const,runtimeBindingKind:TEACHER_FORM_RUNTIME_KIND,
      runtimeBindingRef:existing.id,replayed:true}
  }
  if(admission.assignment.status!=='OPEN')
    throw new RunStartExecutionError('RUN_START_OUTCOME_UNKNOWN','Teacher Form assignment not open',409)
  // Revoked product grants or closed events are checked under START locks.
  if (!inline) {
    await assertCurrentRunStartAuthority(tx, input.executionId, { productScope })
  }
  if(admission.execution.runStatus!=='PUBLISHED')
    throw new RunStartExecutionError('RUN_NOT_STARTABLE','Teacher assessment is not published',409)

  const repository=createSqlRelationalAssignmentRepository(tx as any)
  const relational=createRelationalAssessmentService(repository)
  const started=await relational.start({
    assignmentId:admission.assignment.assignmentId,actorUserId:input.actorUserId,
  })
  if(started.attemptIdentity.respondentUserId!==input.actorUserId
    ||started.attemptIdentity.subjectUserId!==admission.attemptIdentity.subjectUserId
    ||started.attemptIdentity.assignmentRef!==admission.attemptIdentity.assignmentRef)
    throw new RunStartExecutionError('RUN_RUNTIME_BINDING_MISMATCH','frozen respondent assignment changed',409)

  const attempt=await tx.huiteacherFormAttempt.create({data:{
    id:randomUUID(),organizationId:admission.execution.organizationId,
    runId:admission.execution.runId,runExecutionId:input.executionId,
    formId:form.id,respondentUserId:input.actorUserId,
    definitionDigest:form.definitionDigest,status:'STARTED',
  }})
  const nowRows=await tx.$queryRaw<Array<{now:Date}>>`SELECT transaction_timestamp() AS "now"`
  if(!inline){
    const dispatched=await tx.$executeRaw`
      UPDATE "assessment_run_execution_start_claims"
      SET "state"='DISPATCHED',
        "dispatched_at"=COALESCE("dispatched_at",${nowRows[0].now}),
        "updated_at"=${nowRows[0].now}
      WHERE "id"=${input.decision.claim.id}
        AND "claim_generation"=${input.decision.claim.claimGeneration}
        AND "state" IN ('CLAIMED','DISPATCHED')
    `
    if(Number(dispatched)!==1)
      throw new RunStartExecutionError('RUN_START_FENCE_LOST','Teacher Form start claim was lost',409)
  }
  // No second runtime mutation: Run owns assignment and START state.
  const bound=await tx.$executeRaw`
    UPDATE "assessment_run_executions"
    SET "runtime_binding_kind"=${TEACHER_FORM_RUNTIME_KIND},
        "runtime_binding_ref"=${attempt.id},
        "status"='STARTED',"started_at"=COALESCE("started_at",${nowRows[0].now}),
        "updated_at"=${nowRows[0].now}
    WHERE "id"=${input.executionId} AND "runtime_binding_ref" IS NULL
      AND "status"='ASSIGNED'
  `
  if(Number(bound)!==1)
    throw new RunStartExecutionError('RUN_RUNTIME_BIND_CONFLICT','Teacher Form runtime binding conflict',409)
  await markRunStartClaimCompleted(tx,{
    claimId:input.decision.claim.id,generation:input.decision.claim.claimGeneration,
    now:nowRows[0].now,allowClaimedInline:inline,
  })
  return {state:'STARTED' as const,runtimeBindingKind:TEACHER_FORM_RUNTIME_KIND,
    runtimeBindingRef:attempt.id,replayed:false}
}

const startTransactionalTeacherForm = async (input:{
  decision:Extract<RunStartClaimDecision,{kind:'ACQUIRED'|'RECOVER'}>
  executionId:string;actorUserId:string;launch:LaunchEnvelope
}):Promise<RunStartExecutionResult>=>{
  try {
    return await classifyStartTransaction(()=>prisma.$transaction(
      tx => executeTransactionalTeacherFormInTx(tx, input),
      START_INTERACTIVE_TRANSACTION,
    ))
  } catch (err) {
    if (!isAssessmentStartBusyError(err)) throw err
    throw await releaseClaimAfterRolledBackDispatch(input.decision.claim, err)
  }
}

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

const boundResultFromPreflight = (
  row: RunStartPreflight | undefined,
  actorUserId: string,
): RunStartExecutionResult | null => {
  if (row && row.respondentUserId === actorUserId && row.runtimeBindingKind && row.runtimeBindingRef) {
    return {
      state: 'STARTED',
      runtimeBindingKind: row.runtimeBindingKind,
      runtimeBindingRef: row.runtimeBindingRef,
      replayed: true,
    }
  }
  return null
}

const readExistingBoundExecution = async (
  executionId: string,
  actorUserId: string,
): Promise<RunStartExecutionResult | null> => {
  const rows = await prisma.$queryRaw<Array<{
    runtimeBindingKind: string | null
    runtimeBindingRef: string | null
    respondentUserId: string
  }>>`
    SELECT e."runtime_binding_kind" AS "runtimeBindingKind",
      e."runtime_binding_ref" AS "runtimeBindingRef",
      respondent."user_id" AS "respondentUserId"
    FROM "assessment_run_executions" e
    JOIN "assessment_run_actor_snapshots" respondent
      ON respondent."organization_id" = e."organization_id"
      AND respondent."run_id" = e."run_id"
      AND respondent."id" = e."respondent_actor_snapshot_id"
    WHERE e."id" = ${executionId}
    LIMIT 1
  `
  return boundResultFromPreflight(rows[0], actorUserId)
}

export const startAssessmentRunExecution = async (input: {
  executionId: string
  actorUserId: string
  resourceRegistry?: RunResourceAuthorityRegistry
  runtimeAdapters?: RunRuntimeAdapterRegistry
  /** Trusted result of an already-performed School/Teacher access read.
   * Prevents an extra SQL roundtrip during constrained pre-gate admission. */
  startPreflight?: RunStartPreflight
}): Promise<RunStartExecutionResult> => {
  const preflight = input.startPreflight?.respondentUserId === input.actorUserId
    && !input.startPreflight.runtimeBindingRef && !input.resourceRegistry
    ? input.startPreflight : undefined
  const compositionCandidate = preflight?.compositionStartCompositeId
  const track = preflight?.compositionStartTrack
  const candidate = compositionCandidate ?? preflight?.preloadCompositeId
  const loadPublication = (id: string) => import('../composite/composite.service')
    .then(module => module.loadStartComposite(id)).catch(() => null)
  const checkCompositionResources = async () => {
    try {
      return await traceAssessmentPhase('start.run_cpu_admission', () => awaitScaleCompositionStartResources(true))
    } catch (err) {
      if (isAssessmentStartResourceGateError(err) && isAssessmentStartCpuPaused()) {
        const bound = await readExistingBoundExecution(input.executionId, input.actorUserId)
        if (bound) return bound
      }
      throw err
    }
  }
  const executeRunStart = async (): Promise<RunStartExecutionResult> => {
    try {
      const prepareBeforeGate = compositionCandidate && track?.policy.runtimeLaunchTarget?.ref === compositionCandidate
      const fastPublishedSelfStart = preflight?.publishedSelfScale === true
      // Avoid starting expensive publication reads during a known CPU pause.
      // Recheck on entry after queueing; the memory trickle still wraps START.
      if (compositionCandidate && !fastPublishedSelfStart && isAssessmentStartCpuPaused()) {
        const check = await checkCompositionResources()
        if (typeof check !== 'boolean') return check
      }
      const prepared = prepareBeforeGate
        ? await traceAssessmentPhase('start.run_prepare_frozen', () => Promise.all([
            loadPublication(compositionCandidate),
            prepareCompositionScientificProvenance(track).catch(() => undefined),
          ]))
        : undefined
      return await runStartGate().run(async () => {
        const check = compositionCandidate
          ? (fastPublishedSelfStart ? admitPrecompiledScaleCompositionStart() : await checkCompositionResources())
          : false
        if (typeof check !== 'boolean') return check
        const admittedScaleBatch = check
        const preparation = prepared ? prepared[0] : candidate ? await loadPublication(candidate) : null
        // The claim transaction is the first durable step of a Run START. Its own
        // rolled-back outcomes (P2028 maxWait, serialization/deadlock/lock-timeout)
        // leave no claim, audit or provenance rows behind, so they share the same
        // safe-retry 503 contract as the runtime dispatch transaction.
        const resourceRegistry = input.resourceRegistry ?? productionRunResourceAuthorityRegistry
        const knownIdentity = input.startPreflight?.respondentUserId === input.actorUserId
          && input.startPreflight.organizationId
          && input.startPreflight.runId
          ? {
              organizationId: input.startPreflight.organizationId,
              runId: input.startPreflight.runId,
              ...(input.startPreflight.hasCampusActivity !== undefined ? { hasCampusActivity: input.startPreflight.hasCampusActivity } : {}),
              ...(input.startPreflight.hasHuiteacherLink !== undefined ? { hasHuiteacherLink: input.startPreflight.hasHuiteacherLink } : {}),
            }
          : undefined
        const decision = await classifyStartTransaction(() =>
          acquireRunExecutionStartClaim({
            executionId: input.executionId,
            actorUserId: input.actorUserId,
            resourceRegistry: input.resourceRegistry,
            ...(knownIdentity ? { knownIdentity } : {}),
            lockCompositionSources: Boolean(compositionCandidate) && !preflight?.publishedSelfScale,
            preparedComposition: prepared?.[1],
            transactionalDispatch: async (inlineContext: TransactionalStartDispatchContext) => {
              const inlineTrack = inlineContext.scientificDetails?.track
              const launch = inlineTrack
                ? parseLaunchEnvelopeFromTrack({
                    family: inlineTrack.resourceFamily as RunResourceFamily,
                    resourceKey: inlineTrack.resourceKey,
                    frozenResourcePolicy: inlineTrack.frozenResourcePolicy,
                  })
                : await readLaunchEnvelope(inlineContext.tx, input.executionId)
              if (launch.resourceKey.startsWith('education-composition:')) {
                const ordinarySelf = (inlineContext.productScope === 'CAMPUS_ONLY' && /:STUDENT:SELF:1\.0\.0$/.test(launch.resourceKey))
                  || (inlineContext.productScope === 'HUITEACHER_ONLY' && /:TEACHER:SELF:1\.0\.0$/.test(launch.resourceKey))
                if (!ordinarySelf || compositionCandidate !== launch.runtimeTargetRef) return null
              }
              const resourceAdapter = resourceRegistry.assertStartSupported(launch.family)
              if (resourceAdapter.capabilities.transactionMode !== 'TRANSACTIONAL_DB') return null
              const inlineDecision = {
                kind: 'ACQUIRED' as const,
                claim: inlineContext.claim,
                admission: inlineContext.admission,
              }
              if (launch.runtimeTargetKind === TEACHER_FORM_RUNTIME_KIND && launch.family === 'FORM') {
                return executeTransactionalTeacherFormInTx(inlineContext.tx, {
                  decision: inlineDecision,
                  executionId: input.executionId,
                  actorUserId: input.actorUserId,
                  launch,
                  inlineContext,
                })
              }
              if (launch.runtimeTargetKind !== 'COMPOSITE') {
                throw new RunStartExecutionError('RUN_RUNTIME_TARGET_UNSUPPORTED', 'transactional Run adapter supports Composite runtime only', 409)
              }
              return executeTransactionalCompositeInTx(inlineContext.tx, {
                decision: inlineDecision,
                executionId: input.executionId,
                actorUserId: input.actorUserId,
                launch,
                ...(candidate === launch.runtimeTargetRef && preparation?.trainingContentSnapshotHash
                  ? { preloadedComposite: preparation } : {}),
                inlineContext,
                admittedScaleBatch,
              })
            },
          }),
        )
        if (decision.kind === 'COMPLETED_INLINE') {
          return decision.result
        }
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

        // The claim transaction already committed, so a pool timeout on this
        // non-transactional read is NOT covered by the single-transaction safety
        // condition of rolledBackStartReason — but the retry still provably
        // recovers the same attempt: nothing from the dispatch committed
        // (dispatch never started), the claim is undispatched, and the existing
        // lease-release helper shortens the CLAIMED claim's lease so the retry
        // takes over through the generation CAS with the same operationKey and
        // frozen admission (or, when the lease cannot be shortened, reports the
        // real remaining wait instead of a blind 1s retry). Without the release,
        // the retry would hit IN_PROGRESS until the 30s lease expires.
        let launch: LaunchEnvelope
        try {
          launch = await readLaunchEnvelope(prisma, input.executionId)
        } catch (err) {
          const reason = rolledBackStartReason(err)
          if (!reason) throw err
          throw await releaseClaimAfterRolledBackDispatch(decision.claim, new AssessmentStartBusyError(reason))
        }
        const resourceAdapter = resourceRegistry.assertStartSupported(launch.family)
        if (resourceAdapter.capabilities.transactionMode === 'TRANSACTIONAL_DB') {
          if (launch.runtimeTargetKind===TEACHER_FORM_RUNTIME_KIND&&launch.family==='FORM')
            return startTransactionalTeacherForm({
              decision,executionId:input.executionId,actorUserId:input.actorUserId,launch,
            })
          if (launch.runtimeTargetKind !== 'COMPOSITE') {
            throw new RunStartExecutionError('RUN_RUNTIME_TARGET_UNSUPPORTED', 'transactional Run adapter supports Composite runtime only', 409)
          }
          let preloadedComposite: any = candidate === launch.runtimeTargetRef
            && preparation?.trainingContentSnapshotHash ? preparation : undefined
          if (!preloadedComposite && typeof (prisma as any)?.compositeAssessment?.findUnique === 'function') {
            try {
              const compositeModule = await import('../composite/composite.service')
              if (typeof compositeModule.loadStartComposite === 'function') {
                preloadedComposite = await compositeModule.loadStartComposite(launch.runtimeTargetRef)
              }
            } catch (err) {
              const reason = rolledBackStartReason(err)
              if (!reason) throw err
              throw await releaseClaimAfterRolledBackDispatch(decision.claim, new AssessmentStartBusyError(reason))
            }
          }
          return startTransactionalComposite({
            decision,
            executionId: input.executionId,
            actorUserId: input.actorUserId,
            launch,
            preloadedComposite,
          })
        }
        return recoverOrDispatchExternal({
          decision,
          executionId: input.executionId,
          actorUserId: input.actorUserId,
          launch,
          runtimeAdapters: input.runtimeAdapters ?? productionRunRuntimeAdapterRegistry,
        })
      })
    } catch (err) {
      throw rethrowGateBusyAsStartBusy(err)
    }
  }

  // Already-bound replays never allocate a new frozen runtime and bypass
  // low-memory trickle/rejection (Decision D-1/D-3); new starts consult the
  // host resource guard before claim TX1, publication loads, and dispatch TX2.
  if (isAssessmentStartResourceConstrained()) {
    const bound = input.startPreflight
      ? boundResultFromPreflight(input.startPreflight, input.actorUserId)
      : await readExistingBoundExecution(input.executionId, input.actorUserId)
    if (bound) return bound
    // CPU-only pressure on the composition path waits inside the existing Run
    // gate. Low-memory trickle must still acquire its gate before the Run gate.
    if (!compositionCandidate || !isAssessmentStartCpuPaused()) {
      return runWithLowMemoryTrickleAdmission(executeRunStart)
    }
  }
  return executeRunStart()
}
