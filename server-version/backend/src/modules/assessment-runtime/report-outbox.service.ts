import { encryptUnifiedRuntimePayload } from './security'
import { REPORT_SUBMISSION_KEY_CONFLICT, REPORT_SUBMISSION_KEY_CONFLICT_MESSAGE } from '../scale/scale-final-submit-conflict'
import { detachedWholeReceiptsEnabled } from './whole-receipt-storage'
import { registerWholeReceiptAtomic } from './whole-receipt-atomic'
import { markAssessmentTimeline, traceAssessmentPhase, recordAssessmentReportClaim } from '../../services/runtimeObservability'
import type { WholeReceiptExecution } from '../composite/whole-questionnaire.service'
import { randomUUID } from 'node:crypto'
import { loadFrozenActiveSlotSet } from './slot-set'
import { evaluateCompleteness } from './unified-aggregate'
import { resolveTrainingFlowScope } from '../composite/training-flow-scope'
import type { CompositeReportJob, Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { acceptsAsyncCompositeReport, assessmentReportConfig } from '../../config/assessmentReports'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { QuestionnaireCompletionAdmissionBusyError } from '../../services/questionnaireCompletionAdmission'

export const REPORT_PARENT_SELECT = {
  trainingFlowSnapshotEncrypted: true, trainingFlowSnapshotHash: true,
  trainingFlowPathEncrypted: true, trainingFlowPathHash: true,
  id: true, status: true, progress: true, completedAt: true, attemptEpoch: true, taskSatisfaction: true,
  asyncReportEpoch: true, deliveryMode: true, runtimeGeneration: true,
  frozenActiveSlotSetHash: true, contextSnapshotHash: true, aggregateInputHash: true,
  assignmentRef: true, deliveryCourseId: true,
  compositeAssessment: { select: { productKind: true, reportPackageKey: true, analysisProtocolKey: true,
    trainingFlowDraft: true, trainingFlowFrozen: true, trainingFlowDigest: true } },
} as const

/** A lost processing lease never cancels an already accepted answer receipt. */
export class ReportProcessingLeaseLostError extends Error {
  constructor() { super('REPORT_PROCESSING_LEASE_LOST'); this.name = 'ReportProcessingLeaseLostError' }
}

export type ReportJobIdentity = {
  attemptEpoch: number
  slotSetHash: string
  contextHash: string | null
}

export const assertReportJobIdentity = (parent: {
  attemptEpoch: number
  frozenActiveSlotSetHash: string | null
  contextSnapshotHash: string | null
}, expected: ReportJobIdentity): void => {
  if (parent.attemptEpoch !== expected.attemptEpoch
    || parent.frozenActiveSlotSetHash !== expected.slotSetHash
    || parent.contextSnapshotHash !== expected.contextHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '报告任务冻结版本已变化', 409)
  }
}

export const readCompositeReportJob = async (attemptId: string, attemptEpoch: number) => (
  prisma.compositeReportJob.findUnique({ where: { attemptId_attemptEpoch: { attemptId, attemptEpoch } } })
)

/** HTTP materialization never needs the sealed answers, manifest or lease. */
export const readCompositeReportMaterialization = async (attemptId: string, attemptEpoch: number) => (
  prisma.compositeReportJob.findUnique({ where: { attemptId_attemptEpoch: { attemptId, attemptEpoch } },
    select: { status: true, reportEncrypted: true, attemptEpoch: true, slotSetHash: true,
      contextHash: true, aggregateInputHash: true } })
)

export const readCompositeReportJobHeader = async (attemptId: string, attemptEpoch: number) => (
  prisma.compositeReportJob.findUnique({ where: { attemptId_attemptEpoch: { attemptId, attemptEpoch } },
    select: { id: true, status: true, errorCode: true, completedAt: true, requestedRevision: true, wholeSubmissionId: true } })
)

const reserveBudget = async (tx: Prisma.TransactionClient): Promise<number> => {
  const limit = assessmentReportConfig().maxPending
  const rows = await tx.$queryRaw<Array<{ pending: number }>>`
    UPDATE "composite_report_queue_budget" SET "pending" = "pending" + 1
    WHERE "id" = 'reports' AND "pending" < ${limit}
    RETURNING "pending"
  `
  if (!rows.length) throw new QuestionnaireCompletionAdmissionBusyError('queue_full', 2)
  return rows[0].pending
}

const releaseBudget = async (tx: Prisma.TransactionClient): Promise<void> => {
  const rows = await tx.$queryRaw<Array<{ pending: number }>>`
    UPDATE "composite_report_queue_budget" SET "pending" = "pending" - 1
    WHERE "id" = 'reports' AND "pending" > 0 RETURNING "pending"
  `
  if (!rows.length) throw new Error('Report queue budget invariant violated')
}

/** Called AFTER the canonical snapshot insert, in its SAME transaction. */
export const enqueueCompositeReportForUnit = async (
  tx: Prisma.TransactionClient,
  input: { compositeAttemptId?: string; attemptEpoch: number; wholeReceipt?: WholeReceiptExecution },
): Promise<string | null> => {
  if (!input.compositeAttemptId) return null
  if (input.wholeReceipt) {
    // The durable whole task already owns the frozen context. Validate its
    // live parent binding and lease in one query, without reloading encrypted
    // slots or the composite definition for each of the eight unit writes.
    const receipt = input.wholeReceipt
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT job."id" FROM "composite_report_jobs" AS job
      JOIN "composite_assessment_attempts" AS parent ON parent."id" = job."attempt_id"
      WHERE job."attempt_id" = ${input.compositeAttemptId} AND job."attempt_epoch" = ${input.attemptEpoch}
        AND parent."attempt_epoch" = job."attempt_epoch" AND parent."status" = 'IN_PROGRESS'
        AND parent."async_report_epoch" = parent."attempt_epoch"
        AND job."slot_set_hash" = parent."frozen_active_slot_set_hash"
        AND job."context_hash" IS NOT DISTINCT FROM parent."context_snapshot_hash"
        AND job."whole_submission_id" = ${receipt.submissionId} AND job."whole_accepted_at" = ${new Date(receipt.acceptedAtMs)}
        AND job."status" = 'PROCESSING' AND job."lease_token" = ${receipt.leaseToken}
        AND job."lease_expires_at" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') FOR UPDATE OF job
    `
    if (!rows.length) throw new ReportProcessingLeaseLostError()
    return rows[0].id
  }
  let parent: any = await tx.compositeAssessmentAttempt.findUnique({
    where: { id: input.compositeAttemptId }, select: { ...REPORT_PARENT_SELECT, frozenActiveSlotSetEncrypted: true },
  })
  if (!parent) return null
  const asyncEligible=parent.asyncReportEpoch===parent.attemptEpoch||acceptsAsyncCompositeReport(parent)
  if(!hasTrainingFlow(parent)&&!asyncEligible)return null
  if (parent.status !== 'IN_PROGRESS' || parent.attemptEpoch !== input.attemptEpoch || !parent.frozenActiveSlotSetHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '报告任务与交卷版本不匹配', 409)
  }
  let acceptedFlow:Awaited<ReturnType<typeof resolveTrainingFlowScope>>=null
  if (hasTrainingFlow(parent)) {
    // Flow FINAL callers hold this lock before inserting their snapshot. Keep
    // the parent -> job -> budget ordering explicit at this boundary too.
    await tx.$queryRaw`SELECT "id" FROM "composite_assessment_attempts" WHERE "id" = ${parent.id} FOR UPDATE`
    parent = await tx.compositeAssessmentAttempt.findUnique({ where: { id: parent.id }, include: {
      compositeAssessment: { include: { items: true, formSections: { include: { items: true } } } },
      formSectionAttempts: true,
    } })
    if (!parent || parent.status !== 'IN_PROGRESS' || parent.attemptEpoch !== input.attemptEpoch) {
      throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '流程报告任务与交卷状态不匹配', 409)
    }
    const flow=await resolveTrainingFlowScope(parent,parent.compositeAssessment,{db:tx,allowAdvance:true})
    if(!flow)throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH','流程证据无法推进',409)
    acceptedFlow=flow
    const encrypted=encryptUnifiedRuntimePayload(flow.evidence)
    await tx.compositeAssessmentAttempt.update({where:{id:parent.id},data:{trainingFlowPathEncrypted:encrypted,trainingFlowPathHash:flow.pathHash}})
    parent={...parent,trainingFlowPathEncrypted:encrypted,trainingFlowPathHash:flow.pathHash}
    if(!asyncEligible)return null
  }
  const id = await enqueueBoundReport(tx, parent, true, acceptedFlow)
  if (parent.asyncReportEpoch !== parent.attemptEpoch) {
    const updated = await tx.compositeAssessmentAttempt.updateMany({
      where: { id: parent.id, attemptEpoch: parent.attemptEpoch, status: 'IN_PROGRESS',
        frozenActiveSlotSetHash: parent.frozenActiveSlotSetHash, contextSnapshotHash: parent.contextSnapshotHash },
      data: { asyncReportEpoch: parent.attemptEpoch },
    })
    if (updated.count !== 1) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '报告任务与交卷状态已变化', 409)
  }
  return id
}

type BoundReportParent = { id: string; attemptEpoch: number; frozenActiveSlotSetHash: string | null; contextSnapshotHash: string | null; frozenActiveSlotSetEncrypted?: string | null;
  trainingFlowSnapshotEncrypted?: string | null; trainingFlowSnapshotHash?: string | null;
  trainingFlowPathEncrypted?: string | null; trainingFlowPathHash?: string | null; compositeAssessment?: any }

const hasTrainingFlow = (parent: BoundReportParent): boolean => [parent.trainingFlowSnapshotEncrypted,
  parent.trainingFlowSnapshotHash, parent.trainingFlowPathEncrypted, parent.trainingFlowPathHash].some(value => value != null)

const enqueueBoundReport = async (tx: Prisma.TransactionClient, parent: BoundReportParent, waitForCompletedUnits = false, acceptedFlow:Awaited<ReturnType<typeof resolveTrainingFlowScope>>=null): Promise<string> => {
  if (!parent.frozenActiveSlotSetHash) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '报告任务冻结单元缺失', 409)
  // Native upsert locks this ONE parent's job before the shared budget row.
  // Coalesce notifications without resetting a running lease. A changed
  // revision is observed by finish(), so an in-flight incomplete scan cannot
  // discard a concurrently committed last unit.
  const rows = await tx.$queryRaw<Array<{ id: string; status: string; budgetHeld: boolean }>>`
    INSERT INTO "composite_report_jobs" (
      "id", "attempt_id", "attempt_epoch", "slot_set_hash", "context_hash",
      "status", "budget_held", "requested_revision", "updated_at"
    ) VALUES (${randomUUID()}, ${parent.id}, ${parent.attemptEpoch}, ${parent.frozenActiveSlotSetHash},
      ${parent.contextSnapshotHash}, 'WAITING', false, 1, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
    ON CONFLICT ("attempt_id", "attempt_epoch") DO UPDATE SET
      "requested_revision" = "composite_report_jobs"."requested_revision" + 1,
      "context_hash" = EXCLUDED."context_hash", "updated_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    WHERE "composite_report_jobs"."slot_set_hash" = EXCLUDED."slot_set_hash"
      AND ("composite_report_jobs"."context_hash" IS NOT DISTINCT FROM EXCLUDED."context_hash"
        OR "composite_report_jobs"."context_hash" IS NULL)
      AND "composite_report_jobs"."status" NOT IN ('READY','CANCELLED')
      AND "composite_report_jobs"."whole_submission_id" IS NULL
    RETURNING "id", "status", "budget_held" AS "budgetHeld"
  `
  const job = rows[0]
  if (!job) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '报告任务已结束或冻结绑定冲突', 409)
  if (!job.budgetHeld) {
    // The per-parent upsert above serializes notifications BEFORE this read.
    // At ReadCommitted the last concurrent unit sees earlier committed units;
    // no incomplete scan consumes a global permit or wakes a report worker.
    if (waitForCompletedUnits) {
      if (!parent.frozenActiveSlotSetEncrypted) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '报告冻结单元缺失', 409)
      const slots = acceptedFlow?.frozenSlots??await loadFrozenActiveSlotSet(parent.frozenActiveSlotSetEncrypted, tx)
      if (slots.snapshotHash !== parent.frozenActiveSlotSetHash || slots.attemptEpoch !== parent.attemptEpoch) {
        throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '报告冻结单元绑定不匹配', 409)
      }
      const flowEnabled = hasTrainingFlow(parent)
      const headers = acceptedFlow?.snapshots??await tx.assessmentUnitSnapshot.findMany({
        where: { compositeAttemptId: parent.id, attemptEpoch: parent.attemptEpoch },
        ...(flowEnabled ? {} : { select: { slotKey: true, attemptEpoch: true, unitType: true, terminalState: true,
          payloadKind: true, sourceType: true, sourceAttemptId: true } }),
      })
      const scope = flowEnabled ? acceptedFlow??await resolveTrainingFlowScope(parent, parent.compositeAssessment,
        { db: tx, snapshotRows: headers, frozenSlots: slots }) : null
      if (flowEnabled && !scope) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '流程报告冻结路径缺失', 409)
      const completeness = evaluateCompleteness({ slots: slots.slots, snapshots: headers,
        attemptEpoch: parent.attemptEpoch, pathPolicy: scope?.aggregatePathPolicy })
      if (completeness.invalidSlotKeys.length) throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '报告单元快照不匹配', 409)
      if (!completeness.ready) return job.id
    }
    await reserveBudget(tx)
    await tx.compositeReportJob.update({ where: { id: job.id }, data: {
      status: 'PENDING', budgetHeld: true, attemptCount: 0, errorCode: null, nextAttemptAt: new Date(),
    } })
  }
  return job.id
}

/** Owner authorization belongs to the caller; retry uses the current frozen binding. */
export const retryCompositeReport = async (parent: BoundReportParent): Promise<void> => {
  await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ status: string; wholeSubmissionId: string | null; errorCode: string | null }>>`
      SELECT "status", "whole_submission_id" AS "wholeSubmissionId", "error_code" AS "errorCode" FROM "composite_report_jobs"
      WHERE "attempt_id" = ${parent.id} AND "attempt_epoch" = ${parent.attemptEpoch}
        AND "slot_set_hash" = ${parent.frozenActiveSlotSetHash}
        AND "context_hash" IS NOT DISTINCT FROM ${parent.contextSnapshotHash} FOR UPDATE
    `
    if (!rows.length) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '没有可恢复的报告任务', 404)
    if (rows[0].status !== 'FAILED') return
    if (rows[0].errorCode === REPORT_SUBMISSION_KEY_CONFLICT) {
      throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', REPORT_SUBMISSION_KEY_CONFLICT_MESSAGE, 409)
    }
    if (rows[0].wholeSubmissionId) {
      await tx.compositeReportJob.updateMany({
        where: { attemptId: parent.id, attemptEpoch: parent.attemptEpoch, status: 'FAILED',
          slotSetHash: parent.frozenActiveSlotSetHash!, contextHash: parent.contextSnapshotHash },
        data: { status: 'PENDING', attemptCount: 0, errorCode: null, nextAttemptAt: new Date(),
          leaseToken: null, leaseExpiresAt: null },
      })
      return
    }
    await enqueueBoundReport(tx, parent)
  }, { isolationLevel: 'ReadCommitted' })
}

export const claimCompositeReportJob = async (): Promise<CompositeReportJob | null> => {
  const settings = assessmentReportConfig()
  const leaseToken = randomUUID()
  const claimRequested = process.hrtime.bigint()
  const rows = await prisma.$queryRaw<Array<Omit<CompositeReportJob, 'wholeValidationEncrypted' | 'wholeValidationHash'>>>`
    UPDATE "composite_report_jobs" AS job SET
      "status" = 'PROCESSING', "lease_token" = ${leaseToken},
      "lease_expires_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + (${settings.leaseMs} * INTERVAL '1 millisecond'),
      "claimed_revision" = job."requested_revision", "attempt_count" = job."attempt_count" + 1,
      "updated_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    FROM (
      SELECT "id" FROM "composite_report_jobs"
      WHERE ("budget_held" = true OR ("whole_submission_id" IS NOT NULL
        AND "whole_answers_encrypted" IS NOT NULL AND "whole_accepted_at" IS NOT NULL)) AND (
        ("status" = 'PENDING' AND "next_attempt_at" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
        OR ("status" = 'PROCESSING' AND "lease_expires_at" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
      ) ORDER BY "next_attempt_at", "created_at" FOR UPDATE SKIP LOCKED LIMIT 1
    ) AS candidate WHERE job."id" = candidate."id" RETURNING job."id" AS "id", job."attempt_id" AS "attemptId", job."attempt_epoch" AS "attemptEpoch", job."slot_set_hash" AS "slotSetHash", job."context_hash" AS "contextHash", job."status" AS "status", job."requested_revision" AS "requestedRevision", job."claimed_revision" AS "claimedRevision", job."attempt_count" AS "attemptCount", job."budget_held" AS "budgetHeld", job."lease_token" AS "leaseToken", job."lease_expires_at" AS "leaseExpiresAt", job."next_attempt_at" AS "nextAttemptAt", job."report_encrypted" AS "reportEncrypted", job."aggregate_input_hash" AS "aggregateInputHash", job."error_code" AS "errorCode", job."completed_at" AS "completedAt", job."created_at" AS "createdAt", job."updated_at" AS "updatedAt", job."whole_submission_id" AS "wholeSubmissionId", job."whole_payload_hash" AS "wholePayloadHash", job."whole_answers_encrypted" AS "wholeAnswersEncrypted", job."whole_accepted_at" AS "wholeAcceptedAt"
  `
  if (!rows[0]) return null
  const claimConfirmed = process.hrtime.bigint()
  const claimed = rows[0]
  // The delivery validation is not used during scoring or report generation.
  const result = claimed ? { ...claimed, wholeValidationEncrypted: null, wholeValidationHash: null } : null
  if (result) recordAssessmentReportClaim(result, claimRequested, claimConfirmed)
  return result
}

export const returnUnstartedCompositeReportJob = async (job: CompositeReportJob): Promise<boolean> => {
  const result = await prisma.compositeReportJob.updateMany({
    where: { id: job.id, status: 'PROCESSING', leaseToken: job.leaseToken },
    data: { status: 'PENDING', leaseToken: null, leaseExpiresAt: null,
      attemptCount: { decrement: 1 }, nextAttemptAt: new Date() },
  })
  return result.count === 1
}

export const renewCompositeReportLease = async (job: CompositeReportJob): Promise<boolean> => {
  const expires = new Date(Date.now() + assessmentReportConfig().leaseMs)
  const result = await prisma.compositeReportJob.updateMany({
    where: { id: job.id, status: 'PROCESSING', leaseToken: job.leaseToken },
    data: { leaseExpiresAt: expires },
  })
  return result.count === 1
}

export type ReportJobOutcome =
  | { kind: 'ready'; reportEncrypted: string; aggregateInputHash: string }
  | { kind: 'waiting' }
  | { kind: 'cancelled' }
  | { kind: 'retry'; errorCode: string; delayMs: number }
  | { kind: 'failed'; errorCode: string }


/** One autocommit statement, with no application round trip while the global
 * budget row is locked. The per-job lock also serializes duplicate finishers.
 */
const finishCompositeReportJobAtomic = async (claimed: CompositeReportJob, outcome: ReportJobOutcome): Promise<boolean> => {
  const retry = outcome.kind === 'retry', ready = outcome.kind === 'ready'
  const terminalStatus = ready ? 'READY' : outcome.kind === 'waiting' ? 'WAITING'
    : outcome.kind === 'cancelled' ? 'CANCELLED' : 'FAILED'
  const rows = await prisma.$queryRaw<Array<{ claimed: boolean; finished: boolean; needsRelease: boolean | null; released: boolean }>>`
    WITH locked AS MATERIALIZED (
      SELECT "id", "requested_revision", "budget_held"
      FROM "composite_report_jobs" WHERE "id" = ${claimed.id}
        AND "status" = 'PROCESSING' AND "lease_token" = ${claimed.leaseToken} FOR UPDATE
    ), decision AS MATERIALIZED (
      SELECT *, ("requested_revision" <> ${claimed.claimedRevision}) AS dirty,
        ("requested_revision" <> ${claimed.claimedRevision} OR ${retry}) AS keep_pending,
        ("budget_held" AND NOT ("requested_revision" <> ${claimed.claimedRevision} OR ${retry})) AS release_needed
      FROM locked
    ), released AS (
      UPDATE "composite_report_queue_budget" SET "pending" = "pending" - 1
      WHERE "id" = 'reports' AND "pending" > 0
        AND EXISTS (SELECT 1 FROM decision WHERE release_needed)
      RETURNING "id"
    ), changed AS (
      UPDATE "composite_report_jobs" job SET
        "status" = (CASE WHEN decision.keep_pending THEN 'PENDING' ELSE ${terminalStatus} END)::"CompositeReportJobStatus",
        "lease_token" = NULL, "lease_expires_at" = NULL, "budget_held" = (decision.keep_pending AND decision."budget_held"),
        "next_attempt_at" = CASE WHEN decision.dirty THEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
          ELSE ${new Date(Date.now() + (retry ? outcome.delayMs : 0))} END,
        "attempt_count" = CASE WHEN decision.dirty THEN 0 ELSE job."attempt_count" END,
        "error_code" = CASE WHEN decision.dirty OR ${ready} THEN NULL
          WHEN ${outcome.kind === 'retry' || outcome.kind === 'failed'}
            THEN ${outcome.kind === 'retry' || outcome.kind === 'failed' ? outcome.errorCode : null}
          ELSE job."error_code" END,
        "report_encrypted" = CASE WHEN NOT decision.dirty AND ${ready}
          THEN ${ready ? outcome.reportEncrypted : null} ELSE job."report_encrypted" END,
        "aggregate_input_hash" = CASE WHEN NOT decision.dirty AND ${ready}
          THEN ${ready ? outcome.aggregateInputHash : null} ELSE job."aggregate_input_hash" END,
        "completed_at" = CASE WHEN NOT decision.dirty AND ${ready}
          THEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') ELSE job."completed_at" END,
        "updated_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      FROM decision WHERE job."id" = decision."id"
        AND (NOT decision.release_needed OR EXISTS (SELECT 1 FROM released))
      RETURNING job."id"
    )
    SELECT EXISTS(SELECT 1 FROM locked) AS claimed, EXISTS(SELECT 1 FROM changed) AS finished,
      (SELECT release_needed FROM decision) AS "needsRelease", EXISTS(SELECT 1 FROM released) AS released
  `
  const row = rows[0]!
  // A corrupt budget leaves the locked job untouched. Database failures roll
  // back both DML CTEs; a JavaScript exception must never follow a partial ACK.
  if (row.claimed && row.needsRelease && !row.released) throw new Error('Report queue budget invariant violated')
  return row.finished
}

/** Lease/CAS fence covers publication AND exactly-once permit release. */
export const finishCompositeReportJob = async (claimed: CompositeReportJob, outcome: ReportJobOutcome): Promise<boolean> => process.env.ASSESSMENT_REPORT_ATOMIC_FINISH_ENABLED === 'true'
  ? finishCompositeReportJobAtomic(claimed, outcome)
  : (
  prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ id: string; requestedRevision: number; budgetHeld: boolean }>>`
      SELECT "id", "requested_revision" AS "requestedRevision", "budget_held" AS "budgetHeld" FROM "composite_report_jobs"
      WHERE "id" = ${claimed.id} AND "status" = 'PROCESSING' AND "lease_token" = ${claimed.leaseToken}
      FOR UPDATE
    `
    if (!rows.length) return false
    const current = rows[0]
    const dirty = current.requestedRevision !== claimed.claimedRevision
    const retry = outcome.kind === 'retry'
    const keepPending = dirty || retry
    const data: Prisma.CompositeReportJobUpdateInput = {
      status: keepPending ? 'PENDING' : outcome.kind === 'ready' ? 'READY'
        : outcome.kind === 'waiting' ? 'WAITING' : outcome.kind === 'cancelled' ? 'CANCELLED' : 'FAILED',
      leaseToken: null, leaseExpiresAt: null,
      budgetHeld: keepPending && current.budgetHeld,
      nextAttemptAt: new Date(Date.now() + (!dirty && retry ? outcome.delayMs : 0)),
      ...(dirty ? { attemptCount: 0, errorCode: null } : {}),
      ...(!dirty && outcome.kind === 'ready' ? { reportEncrypted: outcome.reportEncrypted,
        aggregateInputHash: outcome.aggregateInputHash, completedAt: new Date(), errorCode: null } : {}),
      ...(!dirty && (outcome.kind === 'retry' || outcome.kind === 'failed') ? { errorCode: outcome.errorCode } : {}),
    }
    await tx.compositeReportJob.update({ where: { id: current.id }, data, select: { id: true } })
    if (!keepPending && current.budgetHeld) await releaseBudget(tx)
    return true
  }, { isolationLevel: 'ReadCommitted' })
)

export const compositeReportJobState = (job: Pick<CompositeReportJob, 'id' | 'status' | 'errorCode' | 'completedAt'> | null) => ({
  state: job?.status ?? 'PENDING',
  jobId: job?.id ?? null,
  retryAfterSeconds: job?.status === 'PROCESSING' ? 5 : 2,
  errorCode: job?.status === 'FAILED'
    ? job.errorCode === REPORT_SUBMISSION_KEY_CONFLICT ? REPORT_SUBMISSION_KEY_CONFLICT : 'REPORT_GENERATION_FAILED'
    : null,
  completedAt: job?.completedAt ?? null,
})

export type WholeQuestionnaireReceipt = {
  id: string; status: string; leaseToken: string | null; wholeSubmissionId: string | null;
  wholePayloadHash: string | null; wholeAnswersEncrypted: string | null; wholeAcceptedAt: Date | null; wholeValidationEncrypted: string | null; wholeValidationHash: string | null;
}
export const readWholeQuestionnaireReceipt = async (attemptId: string, attemptEpoch: number, withAnswers = true, db: Pick<Prisma.TransactionClient, '$queryRaw'> = prisma): Promise<WholeQuestionnaireReceipt | null> => {
  const rows = await db.$queryRaw<WholeQuestionnaireReceipt[]>`
    SELECT "id", "status", "lease_token" AS "leaseToken", "whole_submission_id" AS "wholeSubmissionId",
      "whole_payload_hash" AS "wholePayloadHash", CASE WHEN ${withAnswers} THEN "whole_answers_encrypted" ELSE NULL END AS "wholeAnswersEncrypted", "whole_accepted_at" AS "wholeAcceptedAt",
      "whole_validation_encrypted" AS "wholeValidationEncrypted", "whole_validation_hash" AS "wholeValidationHash"
    FROM "composite_report_jobs" WHERE "attempt_id" = ${attemptId} AND "attempt_epoch" = ${attemptEpoch}
  `
  return rows[0] ?? null
}

export const assertNoAcceptedWholeQuestionnaire = async (tx: Pick<Prisma.TransactionClient, '$queryRaw'>, attemptId: string): Promise<void> => {
  // Caller holds the parent row lock. A nonlocking read sees any ACK already
  // committed; an uncommitted receipt must still win its parent CAS afterwards.
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "composite_report_jobs"
    WHERE "attempt_id" = ${attemptId} AND "whole_submission_id" IS NOT NULL LIMIT 1`
  if (rows.length) throw new InstrumentFinalSubmitError('SUBMISSION_ALREADY_IN_PROGRESS', '整份问卷已可靠接收，请查看报告进度，不能重启或重新交卷', 409)
}

export const registerWholeQuestionnaireReceipt = async (parent: BoundReportParent, input: {
  submissionId: string; payloadHash: string; answersEncrypted: string; acceptedAt: Date; requiredFormSlots: string[]; validationHash?: string;
}): Promise<{ acceptedAt: Date; replayed: boolean; queueDepth?: number }> => (detachedWholeReceiptsEnabled() || process.env.ASSESSMENT_WHOLE_ATOMIC_RECEIPT_ENABLED === 'true')
  ? registerWholeReceiptAtomic(parent, input)
  : traceAssessmentPhase('whole.transaction_roundtrip', () => prisma.$transaction(async tx => {
  markAssessmentTimeline('whole.transaction_callback_start')
  try {
  const rows = await traceAssessmentPhase('whole.tx.job_upsert_lock', () => tx.$queryRaw<Array<{ id: string; status: string; budgetHeld: boolean; wholeSubmissionId: string | null; wholePayloadHash: string | null; wholeAcceptedAt: Date | null }>>`
    INSERT INTO "composite_report_jobs" (
      "id", "attempt_id", "attempt_epoch", "slot_set_hash", "context_hash", "status", "budget_held", "requested_revision", "updated_at"
    ) VALUES (${randomUUID()}, ${parent.id}, ${parent.attemptEpoch}, ${parent.frozenActiveSlotSetHash}, ${parent.contextSnapshotHash}, 'WAITING', false, 1, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
    ON CONFLICT ("attempt_id", "attempt_epoch") DO UPDATE SET "id" = "composite_report_jobs"."id"
    WHERE "composite_report_jobs"."slot_set_hash" = EXCLUDED."slot_set_hash"
      AND "composite_report_jobs"."context_hash" IS NOT DISTINCT FROM EXCLUDED."context_hash"
    RETURNING "id", "status", "budget_held" AS "budgetHeld", "whole_submission_id" AS "wholeSubmissionId",
      "whole_payload_hash" AS "wholePayloadHash", "whole_accepted_at" AS "wholeAcceptedAt"
  `)
  const job = rows[0]
  if (!job) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '整份交卷冻结绑定冲突', 409)
  if (job.wholeSubmissionId) {
    if (job.wholeSubmissionId !== input.submissionId || job.wholePayloadHash !== input.payloadHash) {
      throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '已收到不同的整份交卷内容', 409)
    }
    return { acceptedAt: job.wholeAcceptedAt!, replayed: true }
  }
  if (job.status !== 'WAITING' || job.budgetHeld) throw new QuestionnaireCompletionAdmissionBusyError('queue_full', 1)
  const headers = await traceAssessmentPhase('whole.tx.snapshot_headers', () => tx.assessmentUnitSnapshot.findMany({
    where: { compositeAttemptId: parent.id, attemptEpoch: parent.attemptEpoch },
    select: { slotKey: true, unitType: true, terminalState: true },
  }))
  if (headers.some(row => row.unitType !== 'FORM_SECTION')
    || input.requiredFormSlots.some(key => !headers.some(row => row.slotKey === key && row.terminalState === 'COMPLETED'))) {
    throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '请先完成必要背景信息；已分量表交卷的作答不能改为整份交卷', 409)
  }
  // One database round trip prepares the parent, encrypted envelope and final
  // shared reservation. SQL dependencies keep the global row last; the caller
  // still rolls back every write if any CAS or reservation fails.
  const persisted = await traceAssessmentPhase('whole.tx.persist_and_budget', () => tx.$queryRaw<Array<{
    parentCount: bigint; envelopeCount: bigint; queueDepth: number | null;
  }>>`
    WITH parent_cas AS (
      UPDATE "composite_assessment_attempts" SET "async_report_epoch" = ${parent.attemptEpoch}
      WHERE "id" = ${parent.id} AND "status" = 'IN_PROGRESS' AND "attempt_epoch" = ${parent.attemptEpoch}
        AND "frozen_active_slot_set_hash" = ${parent.frozenActiveSlotSetHash}
        AND "context_snapshot_hash" IS NOT DISTINCT FROM ${parent.contextSnapshotHash}
      RETURNING "id"
    ), envelope AS (
      UPDATE "composite_report_jobs" AS job SET "whole_submission_id" = ${input.submissionId},
        "whole_payload_hash" = ${input.payloadHash}, "whole_answers_encrypted" = ${input.answersEncrypted},
        "whole_accepted_at" = ${input.acceptedAt}, "status" = 'PENDING', "budget_held" = true,
        "attempt_count" = 0, "error_code" = NULL, "next_attempt_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        "updated_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      FROM parent_cas WHERE job."id" = ${job.id} RETURNING job."id"
    ), reserved AS (
      UPDATE "composite_report_queue_budget" SET "pending" = "pending" + 1
      WHERE "id" = 'reports' AND "pending" < ${assessmentReportConfig().maxPending}
        AND EXISTS (SELECT 1 FROM envelope) RETURNING "pending"
    )
    SELECT (SELECT count(*) FROM parent_cas) AS "parentCount",
      (SELECT count(*) FROM envelope) AS "envelopeCount",
      (SELECT "pending" FROM reserved) AS "queueDepth"
  `)
  const saved = persisted[0]
  if (!saved || Number(saved.parentCount) !== 1 || Number(saved.envelopeCount) !== 1) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷状态已变化，尚未确认接收', 409)
  }
  if (saved.queueDepth === null) throw new QuestionnaireCompletionAdmissionBusyError('queue_full', 2)
  const queueDepth = saved.queueDepth
  return { acceptedAt: input.acceptedAt, replayed: false, queueDepth }
  } finally { markAssessmentTimeline('whole.transaction_callback_end') }
}, { isolationLevel: 'ReadCommitted', maxWait: 2000, timeout: 10_000 })).then(receipt => {
  markAssessmentTimeline('whole.commit_confirmed')
  return receipt
})

export const storeWholeQuestionnaireValidation = async (parent: BoundReportParent, encrypted: string, hash: string): Promise<void> => {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "composite_report_jobs" (
      "id", "attempt_id", "attempt_epoch", "slot_set_hash", "context_hash", "status", "budget_held", "requested_revision",
      "whole_validation_encrypted", "whole_validation_hash", "updated_at"
    ) VALUES (${randomUUID()}, ${parent.id}, ${parent.attemptEpoch}, ${parent.frozenActiveSlotSetHash}, ${parent.contextSnapshotHash},
      'WAITING', false, 0, ${encrypted}, ${hash}, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
    ON CONFLICT ("attempt_id", "attempt_epoch") DO UPDATE SET
      "whole_validation_encrypted" = EXCLUDED."whole_validation_encrypted", "whole_validation_hash" = EXCLUDED."whole_validation_hash"
    WHERE "composite_report_jobs"."slot_set_hash" = EXCLUDED."slot_set_hash"
      AND "composite_report_jobs"."context_hash" IS NOT DISTINCT FROM EXCLUDED."context_hash"
      AND "composite_report_jobs"."whole_submission_id" IS NULL
      AND "composite_report_jobs"."status" = 'WAITING' AND "composite_report_jobs"."budget_held" = false
    RETURNING "id"
  `
  if (!rows.length) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷已经交卷或冻结准备已变化', 409)
}
