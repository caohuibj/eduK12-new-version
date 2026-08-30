/**
 * Helpers shared by assignment and authenticated check-in submission
 * controllers.  Idempotency receipts deliberately contain a JSON snapshot of
 * the response produced by the write transaction.  Replaying that immutable
 * snapshot means an older request can never mutate the current submission
 * after a newer request has committed.
 */

type SubmissionRecord = Record<string, any>

const dateValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : null
}

/** Keep only fields returned by the existing assignment submit endpoint. */
export const assignmentSubmissionSnapshot = (submission: SubmissionRecord) => ({
  id: submission.id,
  assignmentId: submission.assignmentId ?? null,
  studentId: submission.studentId ?? null,
  revision: Number.isInteger(submission.revision) ? submission.revision : 0,
  content: submission.content ?? null,
  answers: submission.answers ?? {},
  comment: submission.comment ?? null,
  status: submission.status ?? null,
  submittedAt: dateValue(submission.submittedAt),
  reviewedAt: dateValue(submission.reviewedAt),
  idempotencyKeyHash: submission.idempotencyKeyHash ?? null,
  idempotencyPayloadHash: submission.idempotencyPayloadHash ?? null,
})

/** Keep only fields returned by the existing authenticated check-in endpoint. */
export const checkinSubmissionSnapshot = (submission: SubmissionRecord) => ({
  id: submission.id,
  checkinId: submission.checkinId ?? null,
  studentId: submission.studentId ?? null,
  revision: Number.isInteger(submission.revision) ? submission.revision : 0,
  content: submission.content ?? null,
  images: submission.images ?? [],
  createdAt: dateValue(submission.createdAt),
  idempotencyKeyHash: submission.idempotencyKeyHash ?? null,
  idempotencyPayloadHash: submission.idempotencyPayloadHash ?? null,
  isAnonymous: submission.isAnonymous ?? false,
  sessionId: submission.sessionId ?? null,
  tokenId: submission.tokenId ?? null,
})

const receiptDelegate = (db: any, delegateName: string): any | null => {
  const delegate = db?.[delegateName]
  return delegate && typeof delegate.findFirst === 'function' ? delegate : null
}

export const findAssignmentIdempotencyReceipt = async (
  db: any,
  assignmentId: string,
  studentId: string,
  idempotencyKeyHash: string,
) => {
  const delegate = receiptDelegate(db, 'submissionIdempotencyReceipt')
  if (!delegate) return null
  return delegate.findFirst({
    where: { assignmentId, studentId, idempotencyKeyHash },
  })
}

export const createAssignmentIdempotencyReceipt = async (
  db: any,
  values: {
    assignmentId: string
    studentId: string
    submissionId: string
    idempotencyKeyHash: string
    idempotencyPayloadHash: string
    response: unknown
  },
) => {
  const delegate = db?.submissionIdempotencyReceipt
  if (!delegate || typeof delegate.create !== 'function') return null
  return delegate.create({ data: values })
}

export const findCheckinIdempotencyReceipt = async (
  db: any,
  checkinId: string,
  studentId: string,
  idempotencyKeyHash: string,
) => {
  const delegate = receiptDelegate(db, 'checkinSubmissionIdempotencyReceipt')
  if (!delegate) return null
  return delegate.findFirst({
    where: { checkinId, studentId, idempotencyKeyHash },
  })
}

export const createCheckinIdempotencyReceipt = async (
  db: any,
  values: {
    checkinId: string
    studentId: string
    submissionId: string
    idempotencyKeyHash: string
    idempotencyPayloadHash: string
    response: unknown
  },
) => {
  const delegate = db?.checkinSubmissionIdempotencyReceipt
  if (!delegate || typeof delegate.create !== 'function') return null
  return delegate.create({ data: values })
}
