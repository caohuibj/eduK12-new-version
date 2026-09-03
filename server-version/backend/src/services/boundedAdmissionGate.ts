import {
  recordBoundedAdmissionRejection,
  setBoundedAdmissionGateState,
} from './runtimeObservability'

export type BoundedAdmissionReason = 'queue_full' | 'timeout' | 'database_busy'

export type BoundedAdmissionGateOptions = {
  /** Low-cardinality gate name used for process-local observability labels. */
  name: string
  maxConcurrent: number
  maxQueue: number
  maxWaitMs: number
  retryAfterSeconds?: number
  /** Stable busy error code returned to callers (e.g. COMPLETION_BUSY). */
  busyCode?: string
  busyMessage?: string
  /**
   * Optional compatibility hook for legacy gauges that are not gate-labelled.
   * Prefer the labelled metrics published automatically from `name`.
   */
  onStateChange?: (active: number, queued: number) => void
  onRejection?: (reason: BoundedAdmissionReason) => void
}

export const positiveInteger = (value: number, name: string, allowZero = false): number => {
  if (!Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`${name} must be ${allowZero ? 'a non-negative' : 'a positive'} integer`)
  }
  return value
}

export const configuredInteger = (name: string, fallback: number, allowZero = false): number => {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const parsed = Number(raw)
  try {
    return positiveInteger(parsed, name, allowZero)
  } catch {
    return fallback
  }
}

export class BoundedAdmissionBusyError extends Error {
  readonly code: string
  readonly reason: BoundedAdmissionReason
  readonly retryAfterSeconds: number
  readonly gate: string

  constructor(input: {
    gate: string
    reason: BoundedAdmissionReason
    retryAfterSeconds: number
    code?: string
    message?: string
  }) {
    super(input.message ?? '请求繁忙，请稍后重试')
    this.name = 'BoundedAdmissionBusyError'
    this.gate = input.gate
    this.reason = input.reason
    this.retryAfterSeconds = input.retryAfterSeconds
    this.code = input.code ?? 'ADMISSION_BUSY'
  }
}

export const isBoundedAdmissionBusyError = (
  error: unknown,
): error is BoundedAdmissionBusyError => (
  error instanceof BoundedAdmissionBusyError
  || (
    Boolean(error)
    && typeof (error as { code?: unknown }).code === 'string'
    && typeof (error as { retryAfterSeconds?: unknown }).retryAfterSeconds === 'number'
    && typeof (error as { reason?: unknown }).reason === 'string'
  )
)

type QueuedOperation<T> = {
  operation: () => Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Process-local bounded admission gate.
 *
 * Requests wait here before opening expensive work (e.g. Serializable
 * transactions or aggregate finalization). A full or expired queue is a
 * retryable capacity signal (503 + Retry-After), never a business failure.
 */
export class BoundedAdmissionGate {
  private active = 0
  private readonly queue: Array<QueuedOperation<unknown>> = []
  private readonly retryAfterSeconds: number
  private readonly busyCode: string
  private readonly busyMessage: string
  private readonly gateName: string

  constructor(private readonly options: BoundedAdmissionGateOptions) {
    this.gateName = options.name
    if (!this.gateName || this.gateName.length > 64) {
      throw new Error('BoundedAdmissionGate name must be a non-empty string of length <= 64')
    }
    positiveInteger(options.maxConcurrent, 'maxConcurrent')
    positiveInteger(options.maxQueue, 'maxQueue', true)
    positiveInteger(options.maxWaitMs, 'maxWaitMs')
    this.retryAfterSeconds = positiveInteger(
      options.retryAfterSeconds ?? Math.max(1, Math.ceil(options.maxWaitMs / 1000)),
      'retryAfterSeconds',
    )
    this.busyCode = options.busyCode ?? 'ADMISSION_BUSY'
    this.busyMessage = options.busyMessage ?? '请求繁忙，请稍后重试'
    this.publishState()
  }

  get name(): string {
    return this.gateName
  }

  getStats(): {
    active: number
    queued: number
    options: BoundedAdmissionGateOptions & { retryAfterSeconds: number }
  } {
    return {
      active: this.active,
      queued: this.queue.length,
      options: {
        ...this.options,
        retryAfterSeconds: this.retryAfterSeconds,
        busyCode: this.busyCode,
        busyMessage: this.busyMessage,
      },
    }
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active < this.options.maxConcurrent) return this.execute(operation)
    if (this.queue.length >= this.options.maxQueue) {
      this.rejectBusy('queue_full')
      return Promise.reject(this.busyError('queue_full'))
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
        this.rejectBusy('timeout')
        this.publishState()
        reject(this.busyError('timeout'))
      }, this.options.maxWaitMs)
      this.queue.push(entry as QueuedOperation<unknown>)
      this.publishState()
    })
  }

  private busyError(reason: BoundedAdmissionReason): BoundedAdmissionBusyError {
    return new BoundedAdmissionBusyError({
      gate: this.gateName,
      reason,
      retryAfterSeconds: this.retryAfterSeconds,
      code: this.busyCode,
      message: this.busyMessage,
    })
  }

  private rejectBusy(reason: BoundedAdmissionReason): void {
    recordBoundedAdmissionRejection(this.gateName, reason)
    this.options.onRejection?.(reason)
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
    setBoundedAdmissionGateState(this.gateName, this.active, this.queue.length)
    this.options.onStateChange?.(this.active, this.queue.length)
  }
}
