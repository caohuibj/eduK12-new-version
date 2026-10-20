import { prisma } from '../../config/database'
import { evaluateTrainingFeedbackForAttempt } from '../composite/training-feedback-binding'

/** READY must describe this exact frozen attempt, not an older cached job. */
export function trainingFeedbackReportReady(parent: any, job: any): boolean {
  if (parent?.status !== 'COMPLETED') return false
  if (parent.asyncReportEpoch === null) return true
  if (parent.asyncReportEpoch !== parent.attemptEpoch) return false
  return Boolean(job && job.status === 'READY' && job.attemptEpoch === parent.attemptEpoch
    && job.slotSetHash === parent.frozenActiveSlotSetHash
    && job.contextHash === parent.contextSnapshotHash
    && parent.aggregateInputHash && job.aggregateInputHash === parent.aggregateInputHash)
}

/** Single compact lookup replaces the former status-only parent lookup. It
 * does not load report ciphertext, answers, enrollment or recruitment windows. */
export async function readCompositeParticipantFeedbackContext(attemptId: string, db: any = prisma) {
  const rows = await db.$queryRaw`
    SELECT jsonb_build_object(
      'id',p.id,'status',p.status,'attemptEpoch',p.attempt_epoch,
      'compositeAssessmentId',p.composite_assessment_id,'deliveryCourseId',p.delivery_course_id,
      'accessTokenId',p.access_token_id,'asyncReportEpoch',p.async_report_epoch,
      'frozenActiveSlotSetHash',p.frozen_active_slot_set_hash,'contextSnapshotHash',p.context_snapshot_hash,
      'aggregateInputHash',p.aggregate_input_hash,'assignmentRef',p.assignment_ref,'respondentType',p.respondent_type,
      'trainingFeedbackSnapshot',p.training_feedback_snapshot,'trainingFeedbackSnapshotHash',p.training_feedback_snapshot_hash,
      'compositeAssessment',jsonb_build_object('id',c.id,'productKind',c.product_kind,'questionnaireType',c.questionnaire_type,
        'publishedAt',c.published_at AT TIME ZONE 'UTC','trainingFlowDigest',c.training_flow_digest,'trainingVariantDigest',c.training_variant_digest,
        'trainingFeedbackPolicy',c.training_feedback_policy,'trainingFeedbackPolicyHash',c.training_feedback_policy_hash)
    ) AS parent,
    CASE WHEN j.id IS NULL THEN NULL ELSE jsonb_build_object('status',j.status,'attemptEpoch',j.attempt_epoch,
      'slotSetHash',j.slot_set_hash,'contextHash',j.context_hash,'aggregateInputHash',j.aggregate_input_hash) END AS job
    FROM composite_assessment_attempts p
    JOIN composite_assessments c ON c.id=p.composite_assessment_id
    LEFT JOIN composite_report_jobs j ON j.attempt_id=p.id AND j.attempt_epoch=p.attempt_epoch AND p.async_report_epoch=p.attempt_epoch
    WHERE p.id=${attemptId}
  `
  return rows[0] ?? null
}

/** Evaluate an already authorized parent. Only a configured, completed async
 * native read without a joined job needs one bounded job-header lookup. */
export async function isLoadedCompositeParticipantFeedbackDeferred(parent: any, db: any = prisma, joinedJob?: any): Promise<boolean> {
  if (!parent) return true
  const timing = evaluateTrainingFeedbackForAttempt(parent, { reportReady: true })
  if (!timing.allowed || !timing.configured || parent.asyncReportEpoch === null) return !timing.allowed
  if (parent.asyncReportEpoch !== parent.attemptEpoch) return true
  const job = joinedJob !== undefined ? joinedJob : await db.compositeReportJob.findUnique({
    where: { attemptId_attemptEpoch: { attemptId: parent.id, attemptEpoch: parent.attemptEpoch } },
    select: { status: true, attemptEpoch: true, slotSetHash: true, contextHash: true, aggregateInputHash: true },
  })
  return !trainingFeedbackReportReady(parent, job)
}

/** All composite participants wait for the whole attempt. Configured Training
 * attempts additionally require generated reports and their frozen release time. */
export async function isCompositeParticipantFeedbackDeferred(attemptId: string | null | undefined, db: any = prisma): Promise<boolean> {
  if (!attemptId) return false
  const loaded = await readCompositeParticipantFeedbackContext(attemptId, db)
  return isLoadedCompositeParticipantFeedbackDeferred(loaded?.parent, db, loaded?.job ?? null)
}
