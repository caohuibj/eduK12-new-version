import {
  checkpointId,
  checkpointScopeKey,
  type AppendCheckpointInput,
  type CheckpointScopeType,
  type CheckpointStore,
  type PendingCheckpoint,
} from './checkpointTypes'

const DATABASE_NAME = 'eduk12-persistence-checkpoints-v1'
const DATABASE_VERSION = 1
const PENDING_STORE = 'pending'
const SEQUENCE_STORE = 'sequences'
const SCOPE_INDEX = 'scopeKey'
export const CHECKPOINT_TTL_MS = 72 * 60 * 60 * 1000

interface SequenceRecord {
  scopeKey: string
  nextSequence: number
}

const hasIndexedDb = () => typeof indexedDB !== 'undefined'

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error || new Error('IndexedDB request failed'))
})

const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve()
  transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'))
  transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'))
})

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (!hasIndexedDb()) {
    reject(new Error('IndexedDB is unavailable'))
    return
  }
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
  request.onupgradeneeded = () => {
    const database = request.result
    const pending = database.objectStoreNames.contains(PENDING_STORE)
      ? request.transaction!.objectStore(PENDING_STORE)
      : database.createObjectStore(PENDING_STORE, { keyPath: 'id' })
    if (!pending.indexNames.contains(SCOPE_INDEX)) pending.createIndex(SCOPE_INDEX, ['scopeType', 'scopeId'], { unique: false })
    if (!database.objectStoreNames.contains(SEQUENCE_STORE)) database.createObjectStore(SEQUENCE_STORE, { keyPath: 'scopeKey' })
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error || new Error('IndexedDB open failed'))
})

const isExpired = (record: PendingCheckpoint) => (
  !Number.isFinite(record.createdAt) || Date.now() - record.createdAt > CHECKPOINT_TTL_MS
)

class MemoryCheckpointStore implements CheckpointStore {
  private readonly records = new Map<string, PendingCheckpoint>()
  private readonly nextSequences = new Map<string, number>()

  async append<TPayload>(input: AppendCheckpointInput<TPayload>) {
    const scopeKey = checkpointScopeKey(input.scopeType, input.scopeId)
    const sequence = this.nextSequences.get(scopeKey) || 1
    this.nextSequences.set(scopeKey, sequence + 1)
    const record: PendingCheckpoint<TPayload> = {
      id: checkpointId(),
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      sequence,
      payload: input.payload,
      createdAt: input.createdAt || Date.now(),
      attempts: 0,
    }
    this.records.set(record.id, record)
    return record
  }

  async list<TPayload>(scopeType: CheckpointScopeType, scopeId: string) {
    const records = Array.from(this.records.values())
      .filter((record) => record.scopeType === scopeType && record.scopeId === scopeId)
      .sort((left, right) => left.sequence - right.sequence) as Array<PendingCheckpoint<TPayload>>
    const expiredIds = records.filter(isExpired).map((record) => record.id)
    if (expiredIds.length > 0) await this.remove(expiredIds)
    return records.filter((record) => !expiredIds.includes(record.id))
  }

  async remove(ids: string[]) {
    ids.forEach((id) => this.records.delete(id))
  }

  async incrementAttempts(ids: string[]) {
    ids.forEach((id) => {
      const record = this.records.get(id)
      if (record) record.attempts += 1
    })
  }

  async count(scopeType: CheckpointScopeType, scopeId: string) {
    return (await this.list(scopeType, scopeId)).length
  }
}

export class IndexedDbCheckpointStore implements CheckpointStore {
  private readonly fallback = new MemoryCheckpointStore()
  private databasePromise: Promise<IDBDatabase> | null = null
  private fallbackMode = false

  private async database() {
    if (!this.databasePromise) {
      this.databasePromise = openDatabase().catch((error) => {
        this.databasePromise = null
        throw error
      })
    }
    return this.databasePromise
  }

  async append<TPayload>(input: AppendCheckpointInput<TPayload>) {
    if (this.fallbackMode) return this.fallback.append(input)
    try {
      const database = await this.database()
      const scopeKey = checkpointScopeKey(input.scopeType, input.scopeId)
      const transaction = database.transaction([PENDING_STORE, SEQUENCE_STORE], 'readwrite')
      const sequenceStore = transaction.objectStore(SEQUENCE_STORE)
      const previous = await requestResult<SequenceRecord | undefined>(sequenceStore.get(scopeKey))
      const sequence = previous?.nextSequence || 1
      sequenceStore.put({ scopeKey, nextSequence: sequence + 1 } satisfies SequenceRecord)
      const record: PendingCheckpoint<TPayload> = {
        id: checkpointId(),
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        sequence,
        payload: input.payload,
        createdAt: input.createdAt || Date.now(),
        attempts: 0,
      }
      transaction.objectStore(PENDING_STORE).put(record)
      await transactionDone(transaction)
      return record
    } catch {
      this.fallbackMode = true
      return this.fallback.append(input)
    }
  }

  async list<TPayload>(scopeType: CheckpointScopeType, scopeId: string) {
    if (this.fallbackMode) return this.fallback.list<TPayload>(scopeType, scopeId)
    try {
      const database = await this.database()
      const transaction = database.transaction(PENDING_STORE, 'readonly')
      const records = await requestResult<Array<PendingCheckpoint<TPayload>>>(
        transaction.objectStore(PENDING_STORE).index(SCOPE_INDEX).getAll([scopeType, scopeId]),
      )
      await transactionDone(transaction)
      const sorted = records.sort((left, right) => left.sequence - right.sequence)
      const expiredIds = sorted.filter(isExpired).map((record) => record.id)
      if (expiredIds.length > 0) {
        await this.remove(expiredIds)
        return sorted.filter((record) => !expiredIds.includes(record.id))
      }
      return sorted
    } catch {
      this.fallbackMode = true
      return this.fallback.list<TPayload>(scopeType, scopeId)
    }
  }

  async remove(ids: string[]) {
    if (ids.length === 0) return
    if (this.fallbackMode) {
      await this.fallback.remove(ids)
      return
    }
    try {
      const database = await this.database()
      const transaction = database.transaction(PENDING_STORE, 'readwrite')
      const store = transaction.objectStore(PENDING_STORE)
      ids.forEach((id) => store.delete(id))
      await transactionDone(transaction)
    } catch {
      this.fallbackMode = true
      await this.fallback.remove(ids)
    }
  }

  async incrementAttempts(ids: string[]) {
    if (ids.length === 0) return
    if (this.fallbackMode) {
      await this.fallback.incrementAttempts(ids)
      return
    }
    try {
      const database = await this.database()
      const transaction = database.transaction(PENDING_STORE, 'readwrite')
      const store = transaction.objectStore(PENDING_STORE)
      for (const id of ids) {
        const record = await requestResult<PendingCheckpoint | undefined>(store.get(id))
        if (record) store.put({ ...record, attempts: record.attempts + 1 })
      }
      await transactionDone(transaction)
    } catch {
      this.fallbackMode = true
      await this.fallback.incrementAttempts(ids)
    }
  }

  async count(scopeType: CheckpointScopeType, scopeId: string) {
    return (await this.list(scopeType, scopeId)).length
  }
}

export const createMemoryCheckpointStore = () => new MemoryCheckpointStore()
export const createCheckpointStore = (): CheckpointStore => hasIndexedDb() ? new IndexedDbCheckpointStore() : new MemoryCheckpointStore()
export const checkpointStore = createCheckpointStore()
