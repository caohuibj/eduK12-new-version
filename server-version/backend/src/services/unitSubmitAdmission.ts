import {
  BoundedAdmissionBusyError,
  BoundedAdmissionGate,
  configuredInteger,
  isBoundedAdmissionBusyError,
  type BoundedAdmissionReason,
} from './boundedAdmissionGate'

export const UNIT_SUBMIT_BUSY_CODE = 'ASSESSMENT_SUBMIT_BUSY'

/** Busy error for UNIT FINAL submit capacity shaping. */
export class UnitSubmitAdmissionBusyError extends BoundedAdmissionBusyError {
  constructor(reason: BoundedAdmissionReason, retryAfterSeconds: number) {
    super({
      gate: 'unit_submit',
      reason,
      retryAfterSeconds,
      code: UNIT_SUBMIT_BUSY_CODE,
      message: '测评提交繁忙，请稍后重试',
    })
    this.name = 'UnitSubmitAdmissionBusyError'
  }
}

export const isUnitSubmitAdmissionBusyError = (
  error: unknown,
): error is UnitSubmitAdmissionBusyError => (
  error instanceof UnitSubmitAdmissionBusyError
  || (
    isBoundedAdmissionBusyError(error)
    && (error as { code?: unknown }).code === UNIT_SUBMIT_BUSY_CODE
  )
  || (Boolean(error) && (error as { code?: unknown }).code === UNIT_SUBMIT_BUSY_CODE)
)

/**
 * Process-local UNIT FINAL submit admission.
 *
 * Gate-D candidate defaults (not production constants): permits 8 / queue 16 /
 * wait 500ms. Override via UNIT_SUBMIT_ADMISSION_* env vars for A/B runs.
 */
export const unitSubmitAdmission = new BoundedAdmissionGate({
  name: 'unit_submit',
  maxConcurrent: configuredInteger('UNIT_SUBMIT_ADMISSION_LIMIT', 8),
  maxQueue: configuredInteger('UNIT_SUBMIT_ADMISSION_QUEUE', 16, true),
  maxWaitMs: configuredInteger('UNIT_SUBMIT_ADMISSION_TIMEOUT_MS', 500),
  retryAfterSeconds: configuredInteger('UNIT_SUBMIT_RETRY_AFTER_SECONDS', 1),
  busyCode: UNIT_SUBMIT_BUSY_CODE,
  busyMessage: '测评提交繁忙，请稍后重试',
})

/** Run UNIT FINAL work under the shared admission gate; normalize busy errors. */
export const withUnitSubmitAdmission = <T>(operation: () => Promise<T>): Promise<T> => (
  unitSubmitAdmission.run(operation).catch((error) => {
    if (error instanceof BoundedAdmissionBusyError && error.code === UNIT_SUBMIT_BUSY_CODE) {
      throw new UnitSubmitAdmissionBusyError(error.reason, error.retryAfterSeconds)
    }
    throw error
  })
)

/** @deprecated Prefer withUnitSubmitAdmission */
export const runWithUnitSubmitAdmission = withUnitSubmitAdmission
