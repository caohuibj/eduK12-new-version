import { Prisma } from '@prisma/client'
import { detachedWholeReceiptsEnabled } from './whole-receipt-storage'
import { prisma } from '../../config/database'
import { assessmentReportConfig } from '../../config/assessmentReports'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { QuestionnaireCompletionAdmissionBusyError } from '../../services/questionnaireCompletionAdmission'
import { markAssessmentTimeline, traceAssessmentPhase } from '../../services/runtimeObservability'

type Parent = { id: string; attemptEpoch: number; frozenActiveSlotSetHash: string | null; contextSnapshotHash: string | null }
type Input = { submissionId: string; payloadHash: string; answersEncrypted: string; acceptedAt: Date; requiredFormSlots: string[]; validationHash?: string }
/**
 * A single implicit PostgreSQL transaction. Every write depends on the locked,
 * eligible parent/job and, for legacy submissions only, a reserved permit; no JS callback runs while the
 * shared budget row is held. SQL failure rolls back the entire statement.
 * Delivery has already persisted the WAITING job and verified manifest.
 */
export const registerWholeReceiptAtomic = async (parent: Parent, input: Input) => {
  const detached = detachedWholeReceiptsEnabled()
  // Answers and their durable task share one commit independently of legacy report permits.
  const reservation = detached ? Prisma.sql`SELECT NULL::integer AS "pending" FROM eligible LIMIT 1`
    : Prisma.sql`UPDATE "composite_report_queue_budget" SET "pending" = "pending" + 1
      WHERE "id" = 'reports' AND "pending" < ${assessmentReportConfig().maxPending}
        AND EXISTS (SELECT 1 FROM eligible) RETURNING "pending"`
  const rows = await traceAssessmentPhase('whole.atomic_statement_roundtrip', () => prisma.$queryRaw<Array<{
    outcome: string; wholeSubmissionId: string | null; wholePayloadHash: string | null;
    acceptedAt: Date | null; queueDepth: number | null;
  }>>`
    WITH job_locked AS MATERIALIZED (
      SELECT job.* FROM "composite_report_jobs" AS job
      WHERE job."attempt_id" = ${parent.id} AND job."attempt_epoch" = ${parent.attemptEpoch}
        AND job."slot_set_hash" = ${parent.frozenActiveSlotSetHash}
        AND job."context_hash" IS NOT DISTINCT FROM ${parent.contextSnapshotHash}
      FOR UPDATE
    ), parent_locked AS MATERIALIZED (
      SELECT p."id" FROM "composite_assessment_attempts" AS p, job_locked AS job
      WHERE p."id" = ${parent.id} AND p."status" = 'IN_PROGRESS'
        AND p."attempt_epoch" = ${parent.attemptEpoch}
        AND p."frozen_active_slot_set_hash" = ${parent.frozenActiveSlotSetHash}
        AND p."context_snapshot_hash" IS NOT DISTINCT FROM ${parent.contextSnapshotHash}
        AND job."whole_submission_id" IS NULL AND job."status" = 'WAITING' AND NOT job."budget_held"
      FOR UPDATE OF p
    ), eligible AS MATERIALIZED (
      SELECT job."id" FROM job_locked AS job, parent_locked
      WHERE (${input.validationHash ?? null}::text IS NULL OR job."whole_validation_hash" = ${input.validationHash ?? null})
        AND NOT EXISTS (
          SELECT 1 FROM "assessment_unit_snapshots" AS s
          WHERE s."composite_attempt_id" = ${parent.id} AND s."attempt_epoch" = ${parent.attemptEpoch}
            AND s."unit_type" <> 'FORM_SECTION'
        )
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(${JSON.stringify(input.requiredFormSlots)}::jsonb) AS required("key")
          WHERE NOT EXISTS (
            SELECT 1 FROM "assessment_unit_snapshots" AS s
            WHERE s."composite_attempt_id" = ${parent.id} AND s."attempt_epoch" = ${parent.attemptEpoch}
              AND s."slot_key" = required."key" AND s."terminal_state" = 'COMPLETED'
          )
        )
    ), reserved AS (
      ${reservation}
    ), parent_saved AS (
      UPDATE "composite_assessment_attempts" AS p SET "async_report_epoch" = ${parent.attemptEpoch}
      FROM reserved, parent_locked WHERE p."id" = parent_locked."id" RETURNING p."id"
    ), receipt_saved AS (
      UPDATE "composite_report_jobs" AS job SET "whole_submission_id" = ${input.submissionId},
        "whole_payload_hash" = ${input.payloadHash}, "whole_answers_encrypted" = ${input.answersEncrypted},
        "whole_accepted_at" = ${input.acceptedAt}, "status" = 'PENDING', "budget_held" = ${!detached},
        "attempt_count" = 0, "error_code" = NULL, "next_attempt_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        "updated_at" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      FROM eligible, parent_saved WHERE job."id" = eligible."id"
      RETURNING job."id", job."whole_submission_id", job."whole_payload_hash", job."whole_accepted_at"
    )
    SELECT CASE
      WHEN job."whole_submission_id" IS NOT NULL THEN 'REPLAY'
      WHEN job."status" <> 'WAITING' OR job."budget_held" THEN 'BUSY'
      WHEN NOT EXISTS (SELECT 1 FROM parent_locked) THEN 'STALE'
      WHEN NOT EXISTS (SELECT 1 FROM eligible) THEN 'INCOMPLETE'
      WHEN NOT EXISTS (SELECT 1 FROM reserved) THEN 'FULL'
      WHEN NOT EXISTS (SELECT 1 FROM receipt_saved) THEN 'INVARIANT'
      ELSE 'ACCEPTED' END AS "outcome",
      COALESCE((SELECT "whole_submission_id" FROM receipt_saved), job."whole_submission_id") AS "wholeSubmissionId",
      COALESCE((SELECT "whole_payload_hash" FROM receipt_saved), job."whole_payload_hash") AS "wholePayloadHash",
      COALESCE((SELECT "whole_accepted_at" FROM receipt_saved), job."whole_accepted_at") AS "acceptedAt",
      (SELECT "pending" FROM reserved) AS "queueDepth"
    FROM job_locked AS job
  `)
  // Resolution of this autocommit statement is the durable ACK boundary.
  markAssessmentTimeline('whole.atomic_statement_confirmed')
  const row = rows[0]
  if (!row || row.outcome === 'STALE') throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '整份交卷冻结绑定或状态已变化', 409)
  if (row.outcome === 'REPLAY') {
    if (row.wholeSubmissionId !== input.submissionId || row.wholePayloadHash !== input.payloadHash) {
      throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '已收到不同的整份交卷内容', 409)
    }
    markAssessmentTimeline('whole.commit_confirmed')
    return { acceptedAt: row.acceptedAt!, replayed: true }
  }
  if (row.outcome === 'FULL' || row.outcome === 'BUSY') throw new QuestionnaireCompletionAdmissionBusyError('queue_full', 2)
  if (row.outcome === 'INCOMPLETE') throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '必要背景信息或整卷交付状态不完整', 409)
  if (row.outcome !== 'ACCEPTED' || !row.acceptedAt || (!detached && !row.queueDepth)) throw new Error('Atomic whole receipt invariant violated')
  markAssessmentTimeline('whole.commit_confirmed')
  return { acceptedAt: row.acceptedAt, replayed: false, ...(row.queueDepth === null ? {} : { queueDepth: row.queueDepth }) }
}
