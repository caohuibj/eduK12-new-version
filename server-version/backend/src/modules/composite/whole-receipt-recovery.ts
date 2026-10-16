import { prisma } from '../../config/database'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
type Principal = { userId?: string; recoveryTokenHash?: string }
/** Receipt-only read: never loads answers, validation manifests or report contents. */
export const recoverWholeQuestionnaireReceipt = async (attemptId: string, submissionId: string, attemptEpoch: number, principal: Principal) => {
  const rows = await prisma.$queryRaw<Array<{
    id: string; userId: string | null; recoveryTokenHash: string | null; epoch: number;
    slotHash: string | null; contextHash: string | null; jobSlot: string | null; jobContext: string | null;
    wholeSubmissionId: string | null; payloadHash: string | null; acceptedAt: Date | null; state: string | null;
  }>>`
    SELECT p."id", p."user_id" AS "userId", p."recovery_token_hash" AS "recoveryTokenHash",
      p."attempt_epoch" AS epoch, p."frozen_active_slot_set_hash" AS "slotHash", p."context_snapshot_hash" AS "contextHash",
      j."slot_set_hash" AS "jobSlot", j."context_hash" AS "jobContext", j."whole_submission_id" AS "wholeSubmissionId",
      j."whole_payload_hash" AS "payloadHash", j."whole_accepted_at" AS "acceptedAt", j."status" AS state
    FROM "composite_assessment_attempts" p
    LEFT JOIN "composite_report_jobs" j ON j."attempt_id" = p."id" AND j."attempt_epoch" = p."attempt_epoch"
    WHERE p."id" = ${attemptId}
  `
  const row = rows[0]
  if (!row) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '问卷作答不存在', 404)
  const owned = principal.userId ? row.userId === principal.userId
    : row.userId === null && Boolean(principal.recoveryTokenHash && row.recoveryTokenHash === principal.recoveryTokenHash)
  if (!owned) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '无权限查询此交卷回执', 403)
  if (row.epoch !== attemptEpoch) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '交卷版本已变化，请保留原草稿核对', 409)
  if (!row.wholeSubmissionId) return { status: 'NOT_RECEIVED' as const, attemptId, submissionId }
  if (row.wholeSubmissionId !== submissionId) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '当前作答保存了另一交卷标识', 409)
  if (!row.payloadHash || !row.acceptedAt || !row.slotHash || row.slotHash !== row.jobSlot || row.contextHash !== row.jobContext) {
    throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '交卷冻结绑定不一致，请保留原草稿核对', 409)
  }
  return { status: 'ACCEPTED' as const, attemptId, submissionId, payloadHash: row.payloadHash,
    acceptedAt: row.acceptedAt, committedAt: new Date(), replayed: true,
    reportStatus: { state: row.state ?? 'PENDING', retryAfterSeconds: 2 } }
}
