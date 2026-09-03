import {
  BoundedAdmissionBusyError,
  BoundedAdmissionGate,
  configuredInteger,
  isBoundedAdmissionBusyError,
  type BoundedAdmissionReason,
} from './boundedAdmissionGate'
import { QuestionnaireCompletionAdmissionBusyError } from './questionnaireCompletionAdmission'

/**
 * Stricter Gate-D candidate defaults for aggregate finalization.
 * Aggregate must not share UNIT permits.
 */
export const aggregateFinalizationAdmission = new BoundedAdmissionGate({
  name: 'aggregate_finalization',
  maxConcurrent: configuredInteger('AGGREGATE_FINALIZATION_ADMISSION_LIMIT', 3),
  maxQueue: configuredInteger('AGGREGATE_FINALIZATION_ADMISSION_QUEUE', 4, true),
  maxWaitMs: configuredInteger('AGGREGATE_FINALIZATION_ADMISSION_TIMEOUT_MS', 250),
  retryAfterSeconds: configuredInteger('AGGREGATE_FINALIZATION_RETRY_AFTER_SECONDS', 1),
  // Keep COMPLETION_BUSY so existing GET/completion clients retry uniformly.
  busyCode: 'COMPLETION_BUSY',
  busyMessage: '测评完成请求繁忙，请稍后重试',
})

/** Run aggregate finalization under its own admission gate. */
export const withAggregateFinalizationAdmission = <T>(operation: () => Promise<T>): Promise<T> => (
  aggregateFinalizationAdmission.run(operation).catch((error) => {
    if (error instanceof BoundedAdmissionBusyError && error.code === 'COMPLETION_BUSY') {
      throw new QuestionnaireCompletionAdmissionBusyError(
        error.reason as BoundedAdmissionReason,
        error.retryAfterSeconds,
      )
    }
    if (isBoundedAdmissionBusyError(error) && (error as { code?: string }).code === 'COMPLETION_BUSY') {
      throw new QuestionnaireCompletionAdmissionBusyError(
        (error as { reason: BoundedAdmissionReason }).reason,
        (error as { retryAfterSeconds: number }).retryAfterSeconds,
      )
    }
    throw error
  })
)
