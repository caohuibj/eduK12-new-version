import { prisma } from '../../config/database'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
type Principal = { userId?: string; recoveryTokenHash?: string }
export type WholeReceiptRow = {
  id: string; userId: string | null; recoveryTokenHash: string | null; epoch: number;
  slotHash: string | null; jobSlot: string | null; wholeSubmissionId: string | null;
  payloadHash: string | null; acceptedAt: Date | null; state: string | null;
}
/** Receipt-only read: never loads answers, validation manifests or report contents. */
export const recoverWholeQuestionnaireReceipt = async (
  attemptId: string, submissionId: string, attemptEpoch: number, principal: Principal, admitted?: WholeReceiptRow,
) => {
  const row = admitted ?? (await prisma.$queryRaw<WholeReceiptRow[]>`
    SELECT p."id", p."user_id" AS "userId", p."recovery_token_hash" AS "recoveryTokenHash",
      p."attempt_epoch" AS epoch, p."frozen_active_slot_set_hash" AS "slotHash",
      j."slot_set_hash" AS "jobSlot", j."whole_submission_id" AS "wholeSubmissionId",
      j."whole_payload_hash" AS "payloadHash", j."whole_accepted_at" AS "acceptedAt", j."status" AS state
    FROM "composite_assessment_attempts" p
    LEFT JOIN "composite_report_jobs" j ON j."attempt_id" = p."id" AND j."attempt_epoch" = p."attempt_epoch"
    WHERE p."id" = ${attemptId}
  `)[0]
  if (!row || row.id !== attemptId) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷作答不存在', 404)
  const owned = principal.userId ? row.userId === principal.userId
    : row.userId === null && Boolean(principal.recoveryTokenHash && row.recoveryTokenHash === principal.recoveryTokenHash)
  if (!owned) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权限查询此交卷回执', 403)
  if (row.epoch !== attemptEpoch) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '交卷版本已变化，请保留原草稿核对', 409)
  if (!row.wholeSubmissionId) return { status: 'NOT_RECEIVED' as const, attemptId, submissionId }
  if (row.wholeSubmissionId !== submissionId) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '当前作答保存了另一交卷标识', 409)
  // X-04A parity: worker-side Form materialization may advance the parent's
  // context_snapshot_hash after durable receipt acceptance, so an accepted
  // receipt recovers by attemptEpoch + slot_set_hash + submissionId without
  // failing a post-materialization context hash comparison.
  if (!row.payloadHash || !row.acceptedAt || !row.slotHash || row.slotHash !== row.jobSlot) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '交卷冻结绑定不一致，请保留原草稿核对', 409)
  }
  return { status: 'ACCEPTED' as const, attemptId, submissionId, payloadHash: row.payloadHash,
    acceptedAt: row.acceptedAt, committedAt: new Date(), replayed: true,
    reportStatus: { state: row.state ?? 'PENDING', retryAfterSeconds: 2 } }
}
