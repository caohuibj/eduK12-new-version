import { randomUUID } from 'node:crypto'
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
    select: { id: true, status: true, errorCode: true, completedAt: true } })
)

const reserveBudget = async (tx: Prisma.TransactionClient): Promise<void> => {
  const limit = assessmentReportConfig().maxPending
  const rows = await tx.$queryRaw<Array<{ pending: number }>>`
    UPDATE "composite_report_queue_budget" SET "pending" = "pending" + 1
    WHERE "id" = 'reports' AND "pending" < ${limit}
    RETURNING "pending"
  `
  if (!rows.length) throw new QuestionnaireCompletionAdmissionBusyError('queue_full', 2)
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
  input: { compositeAttemptId?: string; attemptEpoch: number },
): Promise<string | null> => {
  if (!input.compositeAttemptId) return null
  const parent = await tx.compositeAssessmentAttempt.findUnique({
    where: { id: input.compositeAttemptId }, select: REPORT_PARENT_SELECT,
  })
  if (!parent || (parent.asyncReportEpoch !== parent.attemptEpoch && !acceptsAsyncCompositeReport(parent))) return null
  if (parent.status !== 'IN_PROGRESS' || parent.attemptEpoch !== input.attemptEpoch || !parent.frozenActiveSlotSetHash) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '报告任务与交卷版本不匹配', 409)
  }
  const id = await enqueueBoundReport(tx, parent)
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

type BoundReportParent = { id: string; attemptEpoch: number; frozenActiveSlotSetHash: string | null; contextSnapshotHash: string | null }

const enqueueBoundReport = async (tx: Prisma.TransactionClient, parent: BoundReportParent): Promise<string> => {
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
    RETURNING "id", "status", "budget_held" AS "budgetHeld"
  `
  const job = rows[0]
  if (!job) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '报告任务已结束或冻结绑定冲突', 409)
  if (!job.budgetHeld) {
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
  return rows[0] ? prisma.compositeReportJob.findFirst({ where: { id: rows[0].id, leaseToken, status: 'PROCESSING' } }) : null
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
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "composite_report_jobs"
      WHERE "id" = ${claimed.id} AND "status" = 'PROCESSING' AND "lease_token" = ${claimed.leaseToken}
      FOR UPDATE
    `
    if (!rows.length) return false
    const current = await tx.compositeReportJob.findUniqueOrThrow({ where: { id: claimed.id } })
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
    await tx.compositeReportJob.update({ where: { id: current.id }, data })
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
