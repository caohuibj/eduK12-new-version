import { Prisma, type PrismaClient } from '@prisma/client'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'

export const REPORT_SUBMISSION_KEY_CONFLICT = 'REPORT_SUBMISSION_KEY_CONFLICT'
export const REPORT_SUBMISSION_KEY_CONFLICT_MESSAGE = '作答已保存，报告需要负责人处理，请勿重复提交或重新生成。'

/** Database-confirmed key occupation, distinct from generic payload conflicts. */
export class ScaleSubmissionKeyConflictError extends InstrumentFinalSubmitError {
  constructor() {
    super('SUBMISSION_PAYLOAD_CONFLICT', '提交标识已被使用，请更换提交标识后重试', 409)
    this.name = 'ScaleSubmissionKeyConflictError'
  }
}
export const isScaleSubmissionKeyConflictError = (error: unknown): error is ScaleSubmissionKeyConflictError =>
  error instanceof ScaleSubmissionKeyConflictError

/** Only used for the authoritative Assessment FINAL update. Never load the
 * conflicting row: another attempt's submission key is not a replay identity.
 * Throw inside the transaction so all writes, including facts, are rolled back.
 */
export const rethrowScaleSubmissionIdConflict = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
    && Array.isArray(error.meta?.target) && error.meta.target.length === 1
    && error.meta.target[0] === 'submission_id') {
    throw new ScaleSubmissionKeyConflictError()
  }
  throw error
}

/** Called only after the enclosing batch transaction has rejected/rolled back.
 * Raw Prisma errors do not reliably expose a constraint name. Confirm a real
 * occupied submission key with a boolean-only read, never another person's row.
 * Successes have no extra query; unconfirmed/database-check failures preserve
 * the original technical error and its bounded retry policy.
 */
export const rethrowConfirmedScaleBatchSubmissionConflict = async (
  error: unknown, submissionIds: string[], assessmentIds: string[], db: Pick<PrismaClient, '$queryRaw'>,
): Promise<never> => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010'
    && error.meta?.code === '23505' && submissionIds.length && assessmentIds.length) {
    let occupied = false
    try {
      const rows = await db.$queryRaw<Array<{ occupied: boolean }>>`
        SELECT EXISTS (SELECT 1 FROM assessments
          WHERE submission_id IN (${Prisma.join(submissionIds)})
            AND id NOT IN (${Prisma.join(assessmentIds)})) AS occupied
      `
      occupied = rows.length === 1 && rows[0].occupied === true
    } catch { /* A failed confirmation cannot establish a permanent conflict. */ }
    if (occupied) throw new ScaleSubmissionKeyConflictError()
  }
  throw error
}
