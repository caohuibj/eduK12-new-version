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
}

interface ScopeRegistration<TPayload> {
  scopeType: CheckpointScopeType
  scopeId: string
  transport: CheckpointTransport<TPayload>
  maxBatchSize: number
  maxWaitMs: number
  timer: ReturnType<typeof setTimeout> | null
  flushPromise: Promise<void> | null
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
      maxBatchSize: 10,
      maxWaitMs: 2000,
      timer: null,
      flushPromise: null,
    }
    registration.transport = transport
    if (options.maxBatchSize !== undefined) registration.maxBatchSize = Math.max(1, Math.floor(options.maxBatchSize))
    if (options.maxWaitMs !== undefined) registration.maxWaitMs = Math.max(0, Math.floor(options.maxWaitMs))
    this.registrations.set(key, registration as ScopeRegistration<unknown>)
  }

  async enqueue<TPayload>(input: AppendCheckpointInput<TPayload>, transport: CheckpointTransport<TPayload>, options: CheckpointSchedulerOptions = {}) {
    const record = await this.store.append(input)
    this.register(input.scopeType, input.scopeId, transport, options)
    const registration = this.registrations.get(scopeKey(input.scopeType, input.scopeId)) as ScopeRegistration<TPayload>
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
    if (registration.flushPromise) return registration.flushPromise
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

  private schedule<TPayload>(registration: ScopeRegistration<TPayload>) {
    if (registration.timer) return
    registration.timer = setTimeout(() => {
      registration.timer = null
      void this.flush(registration.scopeType, registration.scopeId).catch(() => undefined)
    }, registration.maxWaitMs)
  }

  private async flushRegistration<TPayload>(registration: ScopeRegistration<TPayload>) {
    try {
      while (true) {
        const records = await this.store.list<TPayload>(registration.scopeType, registration.scopeId)
        if (records.length === 0) return
        const batchRecords = records.slice(0, registration.maxBatchSize)
        await this.store.incrementAttempts(batchRecords.map((record) => record.id))
        const ack = await registration.transport({ scopeType: registration.scopeType, scopeId: registration.scopeId, records: batchRecords })
        const ids = acknowledgedIds(batchRecords, ack)
        if (ids.length === 0) throw new Error('Checkpoint transport did not acknowledge any record')
        await this.store.remove(ids)
        if (ids.length < batchRecords.length) {
          this.schedule(registration)
          return
        }
      }
    } catch (error) {
      this.schedule(registration)
      throw error
    }
  }
}

export const checkpointScheduler = new CheckpointScheduler()
