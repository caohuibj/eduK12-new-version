import {
  BoundedAdmissionBusyError,
  BoundedAdmissionGate,
  configuredInteger,
  isBoundedAdmissionBusyError,
  type BoundedAdmissionReason,
} from './boundedAdmissionGate'

export const WHOLE_SUBMIT_BUSY_CODE = 'ASSESSMENT_SUBMIT_BUSY'

/** Busy error for WHOLE questionnaire submit capacity shaping. */
export class WholeSubmitAdmissionBusyError extends BoundedAdmissionBusyError {
  constructor(reason: BoundedAdmissionReason, retryAfterSeconds: number) {
    super({
      gate: 'whole_submit',
      reason,
      retryAfterSeconds,
      code: WHOLE_SUBMIT_BUSY_CODE,
      message: '整卷提交繁忙，请稍后重试',
    })
    this.name = 'WholeSubmitAdmissionBusyError'
  }
}

export const isWholeSubmitAdmissionBusyError = (
  error: unknown,
): error is WholeSubmitAdmissionBusyError => (
  error instanceof WholeSubmitAdmissionBusyError
  || (
    isBoundedAdmissionBusyError(error)
    && (error as { code?: unknown }).code === WHOLE_SUBMIT_BUSY_CODE
  )
  || (Boolean(error) && (error as { code?: unknown }).code === WHOLE_SUBMIT_BUSY_CODE)
)

/**
 * Process-local WHOLE submit admission.
 *
 * Dedicated admission gate for Scheme X whole questionnaire ingestion:
 * Default 32 concurrency, 64 queue, 1000ms timeout for light encrypted envelope ingestion.
 */
export const wholeSubmitAdmission = new BoundedAdmissionGate({
  name: 'whole_submit',
  maxConcurrent: configuredInteger('WHOLE_SUBMIT_ADMISSION_LIMIT', 32),
  maxQueue: configuredInteger('WHOLE_SUBMIT_ADMISSION_QUEUE', 64, true),
  maxWaitMs: configuredInteger('WHOLE_SUBMIT_ADMISSION_TIMEOUT_MS', 1000),
  retryAfterSeconds: configuredInteger('WHOLE_SUBMIT_RETRY_AFTER_SECONDS', 1),
  busyCode: WHOLE_SUBMIT_BUSY_CODE,
  busyMessage: '整卷提交繁忙，请稍后重试',
})

/** Run WHOLE submit work under the dedicated 32-concurrency admission gate; normalize busy errors. */
export const withWholeSubmitAdmission = <T>(operation: () => Promise<T>): Promise<T> => (
  wholeSubmitAdmission.run(operation).catch((error) => {
    if (error instanceof BoundedAdmissionBusyError && error.code === WHOLE_SUBMIT_BUSY_CODE) {
      throw new WholeSubmitAdmissionBusyError(error.reason, error.retryAfterSeconds)
    }
    throw error
  })
)
