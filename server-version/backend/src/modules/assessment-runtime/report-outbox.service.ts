import { markAssessmentTimeline, traceAssessmentPhase, recordAssessmentReportClaim } from '../../services/runtimeObservability'
import type { WholeReceiptExecution } from '../composite/whole-questionnaire.service'
import { randomUUID } from 'node:crypto'
import { decryptFrozenActiveSlotSet } from './slot-set'
import { evaluateCompleteness } from './unified-aggregate'
import type { CompositeReportJob, Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { acceptsAsyncCompositeReport, assessmentReportConfig } from '../../config/assessmentReports'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { QuestionnaireCompletionAdmissionBusyError } from '../../services/questionnaireCompletionAdmission'

export const REPORT_PARENT_SELECT = {
  id: true, status: true, progress: true, completedAt: true, attemptEpoch: true,
  asyncReportEpoch: true, deliveryMode: true, runtimeGeneration: true,
  frozenActiveSlotSetHash: true, contextSnapshotHash: true, aggregateInputHash: true,
  assignmentRef: true, deliveryCourseId: true,
  compositeAssessment: { select: { productKind: true, reportPackageKey: true, analysisProtocolKey: true } },
} as const

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
    if (!rows.length) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '整份交卷处理租约或冻结绑定已变化', 409)
    return rows[0].id
  }
  const parent = await tx.compositeAssessmentAttempt.findUnique({
    where: { id: input.compositeAttemptId }, select: { ...REPORT_PARENT_SELECT, frozenActiveSlotSetEncrypted: true },
  })
  if (!parent || (parent.asyncReportEpoch !== parent.attemptEpoch && !acceptsAsyncCompositeReport(parent))) return null
  if (parent.status !== 'IN_PROGRESS' || parent.attemptEpoch !== input.attemptEpoch || !parent.frozenActiveSlotSetHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '报告任务与交卷版本不匹配', 409)
  }
  const id = await enqueueBoundReport(tx, parent, true)
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

type BoundReportParent = { id: string; attemptEpoch: number; frozenActiveSlotSetHash: string | null; contextSnapshotHash: string | null; frozenActiveSlotSetEncrypted?: string | null }

const enqueueBoundReport = async (tx: Prisma.TransactionClient, parent: BoundReportParent, waitForCompletedUnits = false): Promise<string> => {
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
      const slots = decryptFrozenActiveSlotSet(parent.frozenActiveSlotSetEncrypted)
      if (slots.snapshotHash !== parent.frozenActiveSlotSetHash || slots.attemptEpoch !== parent.attemptEpoch) {
        throw new InstrumentFinalSubmitError('DEFINITION_MISMATCH', '报告冻结单元绑定不匹配', 409)
      }
      const headers = await tx.assessmentUnitSnapshot.findMany({
        where: { compositeAttemptId: parent.id, attemptEpoch: parent.attemptEpoch },
        select: { slotKey: true, attemptEpoch: true, unitType: true, terminalState: true,
          payloadKind: true, sourceType: true, sourceAttemptId: true },
      })
      const completeness = evaluateCompleteness({ slots: slots.slots, snapshots: headers, attemptEpoch: parent.attemptEpoch })
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
    const rows = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT "status" FROM "composite_report_jobs"
      WHERE "attempt_id" = ${parent.id} AND "attempt_epoch" = ${parent.attemptEpoch} FOR UPDATE
    `
    if (!rows.length) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '没有可恢复的报告任务', 404)
    if (rows[0].status !== 'FAILED') return
    await enqueueBoundReport(tx, parent)
  }, { isolationLevel: 'ReadCommitted' })
}

export const claimCompositeReportJob = async (): Promise<CompositeReportJob | null> => {
  const settings = assessmentReportConfig()
  const leaseToken = randomUUID()
  const claimRequested = process.hrtime.bigint()
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "composite_report_jobs" AS job SET
      "status" = 'PROCESSING', "lease_token" = ${leaseToken},
      "lease_expires_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + (${settings.leaseMs} * INTERVAL '1 millisecond'),
      "claimed_revision" = job."requested_revision", "attempt_count" = job."attempt_count" + 1,
      "updated_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    FROM (
      SELECT "id" FROM "composite_report_jobs"
      WHERE "budget_held" = true AND (
        ("status" = 'PENDING' AND "next_attempt_at" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
        OR ("status" = 'PROCESSING' AND "lease_expires_at" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
      ) ORDER BY "next_attempt_at", "created_at" FOR UPDATE SKIP LOCKED LIMIT 1
    ) AS candidate WHERE job."id" = candidate."id" RETURNING job."id"
  `
  if (!rows[0]) return null
  const claimConfirmed = process.hrtime.bigint()
  const claimed = await prisma.compositeReportJob.findFirst({ where: { id: rows[0].id, leaseToken, status: 'PROCESSING' }, select: {
    id: true, attemptId: true, attemptEpoch: true, slotSetHash: true, contextHash: true, status: true,
    requestedRevision: true, claimedRevision: true, attemptCount: true, budgetHeld: true, leaseToken: true,
    leaseExpiresAt: true, nextAttemptAt: true, reportEncrypted: true, aggregateInputHash: true, errorCode: true,
    completedAt: true, createdAt: true, updatedAt: true,
    wholeSubmissionId: true, wholePayloadHash: true, wholeAnswersEncrypted: true, wholeAcceptedAt: true,
  } })
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

/** Lease/CAS fence covers publication AND exactly-once permit release. */
export const finishCompositeReportJob = async (claimed: CompositeReportJob, outcome: ReportJobOutcome): Promise<boolean> => (
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
      budgetHeld: keepPending,
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
  errorCode: job?.status === 'FAILED' ? 'REPORT_GENERATION_FAILED' : null,
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
  submissionId: string; payloadHash: string; answersEncrypted: string; acceptedAt: Date; requiredFormSlots: string[];
}): Promise<{ acceptedAt: Date; replayed: boolean; queueDepth?: number }> => traceAssessmentPhase('whole.transaction_roundtrip', () => prisma.$transaction(async tx => {
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
  const updated = await traceAssessmentPhase('whole.tx.parent_cas', () => tx.compositeAssessmentAttempt.updateMany({
    where: { id: parent.id, status: 'IN_PROGRESS', attemptEpoch: parent.attemptEpoch,
      frozenActiveSlotSetHash: parent.frozenActiveSlotSetHash, contextSnapshotHash: parent.contextSnapshotHash },
    data: { asyncReportEpoch: parent.attemptEpoch },
  }))
  if (updated.count !== 1) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷状态已变化，尚未确认接收', 409)
  await traceAssessmentPhase('whole.tx.durable_envelope', () => tx.$executeRaw`UPDATE "composite_report_jobs" SET "whole_submission_id" = ${input.submissionId},
    "whole_payload_hash" = ${input.payloadHash}, "whole_answers_encrypted" = ${input.answersEncrypted},
    "whole_accepted_at" = ${input.acceptedAt}, "status" = 'PENDING', "budget_held" = true,
    "attempt_count" = 0, "error_code" = NULL, "next_attempt_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "updated_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE "id" = ${job.id}`)
  // Keep the shared budget row last: the per-parent envelope remains invisible
  // until COMMIT, and a full budget rolls back this transaction's prepared write.
  const queueDepth = await traceAssessmentPhase('whole.tx.queue_budget', () => reserveBudget(tx))
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
