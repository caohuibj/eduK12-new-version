import {
  recordCompletionAdmissionRejection,
  setCompletionAdmissionState,
} from './runtimeObservability'

export type CompletionAdmissionReason = 'queue_full' | 'timeout' | 'database_busy'

export type CompletionAdmissionOptions = {
  maxConcurrent: number
  maxQueue: number
  maxWaitMs: number
  retryAfterSeconds?: number
}

const positiveInteger = (value: number, name: string, allowZero = false): number => {
  if (!Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`${name} must be ${allowZero ? 'a non-negative' : 'a positive'} integer`)
  }
  return value
}

const configuredInteger = (name: string, fallback: number, allowZero = false): number => {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const parsed = Number(raw)
  try {
    return positiveInteger(parsed, name, allowZero)
  } catch {
    return fallback
  }
}

export class QuestionnaireCompletionAdmissionBusyError extends Error {
  readonly code = 'COMPLETION_BUSY'
  readonly reason: CompletionAdmissionReason
  readonly retryAfterSeconds: number

  constructor(reason: CompletionAdmissionReason, retryAfterSeconds: number) {
    super('问卷完成请求繁忙，请稍后重试')
    this.name = 'QuestionnaireCompletionAdmissionBusyError'
    this.reason = reason
    this.retryAfterSeconds = retryAfterSeconds
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
): QuestionnaireCompletionAdmissionBusyError => {
  if (error instanceof QuestionnaireCompletionAdmissionBusyError) return error
  if (isTransientCompletionDatabaseError(error)) {
    recordCompletionAdmissionRejection('database_busy')
    return new QuestionnaireCompletionAdmissionBusyError('database_busy', retryAfterSeconds)
  }
  throw error
}

type QueuedOperation<T> = {
  operation: () => Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Process-local bounded admission for questionnaire finalization.
 *
 * The queue is deliberately separate from Prisma's pool. Requests wait here
 * before opening a Serializable transaction; a full/expired queue is a
 * retryable capacity signal, never a business validation failure.
 */
export class QuestionnaireCompletionAdmission {
  private active = 0
  private readonly queue: Array<QueuedOperation<unknown>> = []
  private readonly retryAfterSeconds: number

  constructor(private readonly options: CompletionAdmissionOptions) {
    positiveInteger(options.maxConcurrent, 'maxConcurrent')
    positiveInteger(options.maxQueue, 'maxQueue', true)
    positiveInteger(options.maxWaitMs, 'maxWaitMs')
    this.retryAfterSeconds = positiveInteger(
      options.retryAfterSeconds ?? Math.max(1, Math.ceil(options.maxWaitMs / 1000)),
      'retryAfterSeconds',
    )
    this.publishState()
  }

  getStats(): { active: number; queued: number; options: CompletionAdmissionOptions } {
    return {
      active: this.active,
      queued: this.queue.length,
      options: { ...this.options, retryAfterSeconds: this.retryAfterSeconds },
    }
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active < this.options.maxConcurrent) return this.execute(operation)
    if (this.queue.length >= this.options.maxQueue) {
      recordCompletionAdmissionRejection('queue_full')
      return Promise.reject(new QuestionnaireCompletionAdmissionBusyError('queue_full', this.retryAfterSeconds))
    }

    return new Promise<T>((resolve, reject) => {
      const entry = {} as QueuedOperation<T>
      entry.operation = operation
      entry.resolve = resolve
      entry.reject = reject
      entry.timer = setTimeout(() => {
        const index = this.queue.indexOf(entry as QueuedOperation<unknown>)
        if (index < 0) return
        this.queue.splice(index, 1)
        recordCompletionAdmissionRejection('timeout')
        this.publishState()
        reject(new QuestionnaireCompletionAdmissionBusyError('timeout', this.retryAfterSeconds))
      }, this.options.maxWaitMs)
      this.queue.push(entry as QueuedOperation<unknown>)
      this.publishState()
    })
  }

  private execute<T>(operation: () => Promise<T>): Promise<T> {
    this.active += 1
    this.publishState()
    return Promise.resolve()
      .then(operation)
      .finally(() => {
        this.active = Math.max(0, this.active - 1)
        this.drain()
        this.publishState()
      })
  }

  private drain(): void {
    while (this.active < this.options.maxConcurrent && this.queue.length > 0) {
      const entry = this.queue.shift()!
      clearTimeout(entry.timer)
      this.execute(entry.operation).then(entry.resolve, entry.reject)
    }
  }

  private publishState(): void {
    setCompletionAdmissionState(this.active, this.queue.length)
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
