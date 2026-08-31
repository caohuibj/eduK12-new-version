import { checkpointStore } from './checkpointStore'
import type {
  AppendCheckpointInput,
  CheckpointAck,
  CheckpointBatch,
  CheckpointScopeType,
  PendingCheckpoint,
} from './checkpointTypes'
import type { CheckpointStore } from './checkpointTypes'

export interface CheckpointTransport<TPayload = unknown> {
  (batch: CheckpointBatch<TPayload>): Promise<CheckpointAck>
}

export interface CheckpointSchedulerOptions {
  maxBatchSize?: number
  maxWaitMs?: number
  onError?: (error: unknown) => void
  retryBaseDelayMs?: number
  retryMaxDelayMs?: number
  retryJitterRatio?: number
}

export interface CheckpointTransportErrorOptions {
  status?: number
  code?: number | string
  retryAfterMs?: number
  retryable?: boolean
}

/** Error used when a transport returns an application-level failure envelope. */
export class CheckpointTransportError extends Error {
  readonly status?: number
  readonly statusCode?: number
  readonly code?: number | string
  readonly retryAfterMs?: number
  readonly retryable?: boolean

  constructor(message: string, options: CheckpointTransportErrorOptions = {}) {
    super(message)
    this.name = 'CheckpointTransportError'
    this.status = options.status
    this.statusCode = options.status
    this.code = options.code
    this.retryAfterMs = options.retryAfterMs
    this.retryable = options.retryable
  }
}

/** Preserve HTTP status across scheduler boundaries for retry/conflict handling. */
export const checkpointErrorStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return undefined
  const value = error as {
    status?: unknown
    statusCode?: unknown
    code?: unknown
    response?: { status?: unknown }
  }
  const candidates = [value.status, value.statusCode, value.response?.status, value.code]
  for (const candidate of candidates) {
    const numeric = typeof candidate === 'number' ? candidate : typeof candidate === 'string' && /^\d+$/.test(candidate) ? Number(candidate) : NaN
    if (Number.isInteger(numeric) && numeric >= 400 && numeric <= 599) return numeric
  }
  return undefined
}

/** Network failures and the standard overloaded/request-timeout responses can retry safely. */
export const isTransientCheckpointError = (error: unknown): boolean => {
  if (error && typeof error === 'object' && typeof (error as { retryable?: unknown }).retryable === 'boolean') {
    return (error as { retryable: boolean }).retryable
  }
  const status = checkpointErrorStatus(error)
  return status === undefined || status === 408 || status === 429 || status >= 500
}

const retryAfterHeaderValue = (error: unknown): unknown => {
  if (!error || typeof error !== 'object') return undefined
  const value = error as {
    retryAfter?: unknown
    response?: { headers?: unknown }
  }
  if (value.retryAfter !== undefined) return value.retryAfter
  const headers = value.response?.headers as {
    get?: (name: string) => unknown
    [key: string]: unknown
  } | undefined
  if (!headers) return undefined
  if (typeof headers.get === 'function') return headers.get('retry-after')
  return headers['retry-after'] ?? headers['Retry-After']
}

/** Read Retry-After as milliseconds while keeping malformed values harmless. */
export const checkpointErrorRetryAfterMs = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return undefined
  const direct = (error as { retryAfterMs?: unknown }).retryAfterMs
  if (typeof direct === 'number' && Number.isFinite(direct) && direct >= 0) return direct

  const value = retryAfterHeaderValue(error)
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value * 1000
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined
}

export class CheckpointScopeBlockedError extends Error {
  readonly status = 409
  readonly statusCode = 409
  readonly code = 'CHECKPOINT_SCOPE_BLOCKED'

  constructor(scopeType: CheckpointScopeType, scopeId: string, cause?: unknown) {
    super(`Checkpoint scope ${scopeType}:${scopeId} is blocked`)
    if (cause !== undefined) Object.defineProperty(this, 'cause', { value: cause, enumerable: false })
    this.name = 'CheckpointScopeBlockedError'
  }
}

interface ScopeRegistration<TPayload> {
  scopeType: CheckpointScopeType
  scopeId: string
  transport: CheckpointTransport<TPayload>
  onError?: (error: unknown) => void
  maxBatchSize: number
  maxWaitMs: number
  retryBaseDelayMs: number
  retryMaxDelayMs: number
  retryJitterRatio: number
  retryAttempt: number
  timer: ReturnType<typeof setTimeout> | null
  retryTimer: ReturnType<typeof setTimeout> | null
  flushPromise: Promise<void> | null
  blocked: boolean
  blockError: unknown
}

const scopeKey = (scopeType: CheckpointScopeType, scopeId: string) => `${scopeType}:${scopeId}`

const acknowledgedIds = <TPayload>(records: Array<PendingCheckpoint<TPayload>>, ack: CheckpointAck) => {
  if (ack.acceptedIds) return records.filter((record) => ack.acceptedIds!.includes(record.id)).map((record) => record.id)
  if (ack.acceptedSequences) return records.filter((record) => ack.acceptedSequences!.includes(record.sequence)).map((record) => record.id)
  if (typeof ack.acceptedSequence === 'number') return records.filter((record) => record.sequence <= ack.acceptedSequence!).map((record) => record.id)
  return []
}

export class CheckpointScheduler {
  private readonly registrations = new Map<string, ScopeRegistration<unknown>>()

  constructor(private readonly store: CheckpointStore = checkpointStore) {}

  register<TPayload>(
    scopeType: CheckpointScopeType,
    scopeId: string,
    transport: CheckpointTransport<TPayload>,
    options: CheckpointSchedulerOptions = {},
  ) {
    const key = scopeKey(scopeType, scopeId)
    const existing = this.registrations.get(key) as ScopeRegistration<TPayload> | undefined
    const registration: ScopeRegistration<TPayload> = existing || {
      scopeType,
      scopeId,
      transport,
      onError: undefined,
      maxBatchSize: 10,
      maxWaitMs: 2000,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 30000,
      retryJitterRatio: 0.2,
      retryAttempt: 0,
      timer: null,
      retryTimer: null,
      flushPromise: null,
      blocked: false,
      blockError: null,
    }
    registration.transport = transport
    if (options.onError) registration.onError = options.onError
    if (options.maxBatchSize !== undefined) registration.maxBatchSize = Math.max(1, Math.floor(options.maxBatchSize))
    if (options.maxWaitMs !== undefined) registration.maxWaitMs = Math.max(0, Math.floor(options.maxWaitMs))
    if (options.retryBaseDelayMs !== undefined) registration.retryBaseDelayMs = Math.max(0, Math.floor(options.retryBaseDelayMs))
    if (options.retryMaxDelayMs !== undefined) registration.retryMaxDelayMs = Math.max(0, Math.floor(options.retryMaxDelayMs))
    if (options.retryJitterRatio !== undefined) registration.retryJitterRatio = Math.min(1, Math.max(0, options.retryJitterRatio))
    this.registrations.set(key, registration as ScopeRegistration<unknown>)
  }

  block(scopeType: CheckpointScopeType, scopeId: string, error?: unknown) {
    const registration = this.registrations.get(scopeKey(scopeType, scopeId))
    if (!registration) return
    registration.blocked = true
    registration.blockError = error ?? new CheckpointScopeBlockedError(scopeType, scopeId)
    if (registration.timer) {
      clearTimeout(registration.timer)
      registration.timer = null
    }
    if (registration.retryTimer) {
      clearTimeout(registration.retryTimer)
      registration.retryTimer = null
    }
  }

  isBlocked(scopeType: CheckpointScopeType, scopeId: string) {
    return this.registrations.get(scopeKey(scopeType, scopeId))?.blocked ?? false
  }

  async enqueue<TPayload>(input: AppendCheckpointInput<TPayload>, transport: CheckpointTransport<TPayload>, options: CheckpointSchedulerOptions = {}) {
    this.register(input.scopeType, input.scopeId, transport, options)
    const registration = this.registrations.get(scopeKey(input.scopeType, input.scopeId)) as ScopeRegistration<TPayload>
    if (registration.blocked) throw registration.blockError ?? new CheckpointScopeBlockedError(input.scopeType, input.scopeId)
    const record = await this.store.append(input)
    const pendingCount = await this.store.count(input.scopeType, input.scopeId)
    if (pendingCount >= registration.maxBatchSize) {
      void this.flush(input.scopeType, input.scopeId).catch(() => undefined)
    } else {
      this.schedule(registration)
    }
    return record
  }

  async flush(scopeType: CheckpointScopeType, scopeId: string) {
    const key = scopeKey(scopeType, scopeId)
    const registration = this.registrations.get(key)
    if (!registration) return
    if (registration.timer) {
      clearTimeout(registration.timer)
      registration.timer = null
    }
    if (registration.retryTimer) {
      clearTimeout(registration.retryTimer)
      registration.retryTimer = null
    }
    if (registration.flushPromise) return registration.flushPromise
    if (registration.blocked) throw registration.blockError ?? new CheckpointScopeBlockedError(scopeType, scopeId)
    registration.flushPromise = this.flushRegistration(registration)
      .finally(() => { registration.flushPromise = null })
    return registration.flushPromise
  }

  async pending(scopeType: CheckpointScopeType, scopeId: string) {
    return this.store.list(scopeType, scopeId)
  }

  async flushAll() {
    await Promise.all(Array.from(this.registrations.values()).map((registration) => this.flush(registration.scopeType, registration.scopeId)))
  }

  async purgeExpired(scopeType?: CheckpointScopeType, scopeId?: string) {
    await this.store.purgeExpired(scopeType, scopeId)
  }

  private schedule<TPayload>(registration: ScopeRegistration<TPayload>) {
    if (registration.blocked || registration.timer || registration.retryTimer) return
    registration.timer = setTimeout(() => {
      registration.timer = null
      void this.flush(registration.scopeType, registration.scopeId).catch(() => undefined)
    }, registration.maxWaitMs)
  }

  private scheduleRetry<TPayload>(registration: ScopeRegistration<TPayload>, error: unknown) {
    if (registration.blocked || registration.retryTimer) return
    const exponent = Math.min(registration.retryAttempt, 30)
    const exponentialDelay = Math.min(
      registration.retryMaxDelayMs,
      registration.retryBaseDelayMs * (2 ** exponent),
    )
    const retryAfter = checkpointErrorRetryAfterMs(error)
    const baseDelay = Math.max(exponentialDelay, retryAfter ?? 0)
    const jitter = registration.retryJitterRatio === 0
      ? 1
      : 1 + ((Math.random() * 2 - 1) * registration.retryJitterRatio)
    const delay = retryAfter === undefined
      ? Math.max(0, Math.round(baseDelay * jitter))
      : Math.max(0, Math.round(baseDelay * jitter), retryAfter)
    registration.retryAttempt += 1
    registration.retryTimer = setTimeout(() => {
      registration.retryTimer = null
      void this.flush(registration.scopeType, registration.scopeId).catch(() => undefined)
    }, delay)
  }

  private async flushRegistration<TPayload>(registration: ScopeRegistration<TPayload>) {
    try {
      while (true) {
        if (registration.blocked) throw registration.blockError ?? new CheckpointScopeBlockedError(registration.scopeType, registration.scopeId)
        const records = await this.store.list<TPayload>(registration.scopeType, registration.scopeId)
        if (records.length === 0) {
          registration.retryAttempt = 0
          return
        }
        const batchRecords = records.slice(0, registration.maxBatchSize)
        await this.store.incrementAttempts(batchRecords.map((record) => record.id))
        const ack = await registration.transport({ scopeType: registration.scopeType, scopeId: registration.scopeId, records: batchRecords })
        const ids = acknowledgedIds(batchRecords, ack)
        if (ids.length === 0) throw new Error('Checkpoint transport did not acknowledge any record')
        await this.store.remove(ids)
        registration.retryAttempt = 0
        if (ids.length < batchRecords.length) {
          this.schedule(registration)
          return
        }
      }
    } catch (error) {
      try {
        registration.onError?.(error)
      } catch {
        // A notification callback must never replace the original transport or
        // storage error and must not interfere with durable retry behavior.
      }
      if (!registration.blocked) {
        if (isTransientCheckpointError(error)) this.scheduleRetry(registration, error)
        else this.block(registration.scopeType, registration.scopeId, error)
      }
      throw error
    }
  }
}

export const checkpointScheduler = new CheckpointScheduler()
