import {
  BoundedAdmissionBusyError,
  BoundedAdmissionGate,
  configuredInteger,
  type BoundedAdmissionGateOptions,
  type BoundedAdmissionReason,
} from './boundedAdmissionGate'
import {
  recordBoundedAdmissionRejection,
  recordCompletionAdmissionRejection,
  setCompletionAdmissionState,
} from './runtimeObservability'

export type CompletionAdmissionReason = BoundedAdmissionReason

export type CompletionAdmissionOptions = {
  maxConcurrent: number
  maxQueue: number
  maxWaitMs: number
  retryAfterSeconds?: number
}

/** Legacy busy error for questionnaire completion; preserves COMPLETION_BUSY. */
export class QuestionnaireCompletionAdmissionBusyError extends BoundedAdmissionBusyError {
  constructor(reason: CompletionAdmissionReason, retryAfterSeconds: number) {
    super({
      gate: 'questionnaire_completion',
      reason,
      retryAfterSeconds,
      code: 'COMPLETION_BUSY',
      message: '问卷完成请求繁忙，请稍后重试',
    })
    this.name = 'QuestionnaireCompletionAdmissionBusyError'
  }
}

export const isQuestionnaireCompletionAdmissionBusyError = (
  error: unknown,
): error is QuestionnaireCompletionAdmissionBusyError => (
  error instanceof QuestionnaireCompletionAdmissionBusyError
  || (Boolean(error) && (error as { code?: unknown }).code === 'COMPLETION_BUSY')
)

export const isTransientCompletionDatabaseError = (error: unknown): boolean => {
  const candidate = error as { code?: unknown; meta?: { code?: unknown } } | null
  return candidate?.code === 'P2024'
    || candidate?.code === 'P2034'
    || candidate?.code === '40001'
    || candidate?.meta?.code === '40001'
}

export const toCompletionAdmissionBusyError = (
  error: unknown,
  retryAfterSeconds = 1,
  gate = 'questionnaire_completion',
): QuestionnaireCompletionAdmissionBusyError => {
  if (error instanceof QuestionnaireCompletionAdmissionBusyError) return error
  if (isTransientCompletionDatabaseError(error)) {
    recordCompletionAdmissionRejection('database_busy')
    recordBoundedAdmissionRejection(gate, 'database_busy')
    return new QuestionnaireCompletionAdmissionBusyError('database_busy', retryAfterSeconds)
  }
  throw error
}

/**
 * Thin wrapper over BoundedAdmissionGate that preserves the historical
 * questionnaire completion admission API and COMPLETION_BUSY contract.
 */
export class QuestionnaireCompletionAdmission {
  private readonly gate: BoundedAdmissionGate

  constructor(options: CompletionAdmissionOptions) {
    const gateOptions: BoundedAdmissionGateOptions = {
      name: 'questionnaire_completion',
      maxConcurrent: options.maxConcurrent,
      maxQueue: options.maxQueue,
      maxWaitMs: options.maxWaitMs,
      retryAfterSeconds: options.retryAfterSeconds,
      busyCode: 'COMPLETION_BUSY',
      busyMessage: '问卷完成请求繁忙，请稍后重试',
      onStateChange: setCompletionAdmissionState,
      onRejection: recordCompletionAdmissionRejection,
    }
    this.gate = new BoundedAdmissionGate(gateOptions)
  }

  getStats(): { active: number; queued: number; options: CompletionAdmissionOptions } {
    const stats = this.gate.getStats()
    return {
      active: stats.active,
      queued: stats.queued,
      options: {
        maxConcurrent: stats.options.maxConcurrent,
        maxQueue: stats.options.maxQueue,
        maxWaitMs: stats.options.maxWaitMs,
        retryAfterSeconds: stats.options.retryAfterSeconds,
      },
    }
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    return this.gate.run(operation).catch((error) => {
      if (error instanceof BoundedAdmissionBusyError && error.code === 'COMPLETION_BUSY') {
        throw new QuestionnaireCompletionAdmissionBusyError(error.reason, error.retryAfterSeconds)
      }
      throw error
    })
  }
}

export const questionnaireCompletionAdmission = new QuestionnaireCompletionAdmission({
  // Keep this configurable for 5/8/10/12/16 A/B runs. The default leaves
  // headroom for ordinary request traffic when the Prisma pool is ten.
  maxConcurrent: configuredInteger('QUESTIONNAIRE_COMPLETION_ADMISSION_LIMIT', 8),
  maxQueue: configuredInteger('QUESTIONNAIRE_COMPLETION_ADMISSION_QUEUE', 64, true),
  maxWaitMs: configuredInteger('QUESTIONNAIRE_COMPLETION_ADMISSION_TIMEOUT_MS', 1500),
  retryAfterSeconds: configuredInteger('QUESTIONNAIRE_COMPLETION_RETRY_AFTER_SECONDS', 1),
})
