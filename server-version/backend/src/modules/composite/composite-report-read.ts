import { prisma } from '../../config/database'
import type { CompositeReportJob } from '@prisma/client'

type HeaderJob = Pick<CompositeReportJob, 'id' | 'status' | 'errorCode' | 'completedAt' | 'requestedRevision' | 'wholeSubmissionId' | 'attemptEpoch' | 'slotSetHash' | 'contextHash' | 'aggregateInputHash' | 'reportEncrypted'>

/** Pure read, no row locks and no transaction held while waiting for readiness. */
export const readCompositeReportStatusContext = async (attemptId: string, includeMaterialization = false) => {
  const rows = await prisma.$queryRaw<Array<{ parent: any; job: HeaderJob | null }>>`
    SELECT jsonb_build_object(
      'id', p."id", 'status', p."status", 'progress', p."progress",
      'completedAt', p."completed_at", 'attemptEpoch', p."attempt_epoch",
      'asyncReportEpoch', p."async_report_epoch", 'deliveryMode', p."delivery_mode",
      'runtimeGeneration', p."runtime_generation", 'frozenActiveSlotSetHash', p."frozen_active_slot_set_hash",
      'contextSnapshotHash', p."context_snapshot_hash", 'aggregateInputHash', p."aggregate_input_hash",
      'assignmentRef', p."assignment_ref", 'deliveryCourseId', p."delivery_course_id",
      'compositeAssessmentId', p."composite_assessment_id", 'userId', p."user_id",
      'recoveryTokenHash', p."recovery_token_hash",
      'compositeAssessment', jsonb_build_object('id', c."id", 'productKind', c."product_kind",
        'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', i."type"))
          FROM "composite_assessment_items" i WHERE i."composite_assessment_id" = c."id"), '[]'::jsonb))
    ) AS parent,
    CASE WHEN j."id" IS NULL THEN NULL ELSE jsonb_build_object(
      'id', j."id", 'status', j."status", 'errorCode', j."error_code",
      'completedAt', j."completed_at", 'requestedRevision', j."requested_revision",
      'wholeSubmissionId', j."whole_submission_id", 'attemptEpoch', j."attempt_epoch",
      'slotSetHash', j."slot_set_hash", 'contextHash', j."context_hash", 'aggregateInputHash', j."aggregate_input_hash",
      'reportEncrypted', CASE WHEN ${includeMaterialization} THEN j."report_encrypted" ELSE NULL END) END AS job
    FROM "composite_assessment_attempts" p
    JOIN "composite_assessments" c ON c."id" = p."composite_assessment_id"
    LEFT JOIN "composite_report_jobs" j ON j."attempt_id" = p."id"
      AND j."attempt_epoch" = p."attempt_epoch" AND p."async_report_epoch" = p."attempt_epoch"
    WHERE p."id" = ${attemptId}
  `
  const row = rows[0]
  if (!row) return null
  // jsonb timestamps are strings. Preserve the existing service Date contract.
  if (row.parent.completedAt) row.parent.completedAt = new Date(/(?:Z|[+-]\\d\\d:\\d\\d)$/.test(row.parent.completedAt) ? row.parent.completedAt : row.parent.completedAt + 'Z')
  if (row.job?.completedAt) row.job.completedAt = new Date(/(?:Z|[+-]\\d\\d:\\d\\d)$/.test(String(row.job.completedAt)) ? String(row.job.completedAt) : String(row.job.completedAt) + 'Z')
  return row
}
