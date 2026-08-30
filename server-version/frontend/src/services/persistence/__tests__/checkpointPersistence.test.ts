import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHECKPOINT_TTL_MS, IndexedDbCheckpointStore, createMemoryCheckpointStore } from '../indexedDbStore'
import { CheckpointScheduler, CheckpointTransportError } from '../checkpointScheduler'

class FakeRequest<T = unknown> {
  result!: T
  error: Error | null = null
  onsuccess: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onupgradeneeded: (() => void) | null = null
  transaction: FakeTransaction | null = null

  succeed(result: T): void {
    this.result = result
    queueMicrotask(() => this.onsuccess?.({ target: this }))
  }

  fail(error: Error): void {
    this.error = error
    queueMicrotask(() => this.onerror?.({ target: this }))
  }
}

type FakeObjectStoreData = Map<string, Record<string, any>>

class FakeDatabase {
  readonly stores = new Map<string, FakeObjectStoreData>()
  readonly objectStoreNames = { contains: (name: string) => this.stores.has(name) }

  constructor(private readonly failureSource: { failNextRead: Error | null }) {}

  consumeFailure(kind: 'read' | 'write'): Error | null {
    if (kind !== 'read') return null
    const error = this.failureSource.failNextRead
    this.failureSource.failNextRead = null
    return error
  }

  createObjectStore(name: string): FakeObjectStore {
    this.stores.set(name, new Map())
    return new FakeObjectStore(this, name, null)
  }

  transaction(names: string | string[], mode: 'readonly' | 'readwrite'): FakeTransaction {
    return new FakeTransaction(this, Array.isArray(names) ? names : [names], mode)
  }
}

class FakeTransaction {
  private outstanding = 0
  oncomplete: (() => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onabort: ((event: unknown) => void) | null = null

  constructor(
    private readonly database: FakeDatabase,
    private readonly names: string[],
    readonly mode: 'readonly' | 'readwrite' | 'versionchange',
  ) {}

  objectStore(name: string): FakeObjectStore {
    if (!this.names.includes(name)) throw new Error(`store ${name} not in transaction`)
    return new FakeObjectStore(this.database, name, this)
  }

  requestStarted(): void {
    this.outstanding += 1
  }

  requestFinished(): void {
    this.outstanding -= 1
    if (this.outstanding === 0) {
      setTimeout(() => this.oncomplete?.(), 0)
    }
  }
}

class FakeObjectStore {
  readonly indexNames = { contains: (name: string) => name === 'scopeKey' }

  constructor(
    private readonly database: FakeDatabase,
    private readonly name: string,
    private readonly transaction: FakeTransaction | null,
  ) {}

  createIndex(): void {}

  private data(): FakeObjectStoreData {
    const data = this.database.stores.get(this.name)
    if (!data) throw new Error(`missing store ${this.name}`)
    return data
  }

  private request<T>(operation: () => T, kind: 'read' | 'write'): FakeRequest<T> {
    const request = new FakeRequest<T>()
    this.transaction?.requestStarted()
    setTimeout(() => {
      try {
        const injectedFailure = this.database.consumeFailure(kind)
        if (injectedFailure) request.fail(injectedFailure)
        else request.succeed(operation())
      } catch (error) {
        request.fail(error instanceof Error ? error : new Error(String(error)))
      } finally {
        this.transaction?.requestFinished()
      }
    }, 0)
    return request
  }

  get(key: string): FakeRequest<Record<string, any> | undefined> {
    return this.request(() => this.data().get(key), 'read')
  }

  getAll(query?: unknown): FakeRequest<Array<Record<string, any>>> {
    return this.request(() => {
      const values = [...this.data().values()]
      if (this.name !== 'pending' || !Array.isArray(query)) return values
      return values.filter((value) => value.scopeType === query[0] && value.scopeId === query[1])
    }, 'read')
  }

  put(value: Record<string, any>): FakeRequest<Record<string, any>> {
    return this.request(() => {
      const key = this.name === 'pending' ? value.id : value.scopeKey
      this.data().set(key, { ...value })
      return value
    }, 'write')
  }

  delete(key: string): FakeRequest<undefined> {
    return this.request(() => {
      this.data().delete(key)
      return undefined
    }, 'write')
  }

  index(): { getAll: (query?: unknown) => FakeRequest<Array<Record<string, any>>> } {
    return { getAll: (query?: unknown) => this.getAll(query) }
  }
}

class FakeIndexedDbFactory {
  readonly databases = new Map<string, FakeDatabase>()
  failNextRead: Error | null = null

  open(name: string): FakeRequest<FakeDatabase> {
    const request = new FakeRequest<FakeDatabase>()
    setTimeout(() => {
      let database = this.databases.get(name)
      if (!database) {
        database = new FakeDatabase(this)
        this.databases.set(name, database)
        request.result = database
        request.transaction = new FakeTransaction(database, [], 'versionchange')
        request.onupgradeneeded?.()
      }
      request.succeed(database)
    }, 0)
    return request
  }
}

const originalIndexedDb = (globalThis as { indexedDB?: unknown }).indexedDB
let fakeIndexedDb: FakeIndexedDbFactory

const installFakeIndexedDb = () => {
  fakeIndexedDb = new FakeIndexedDbFactory()
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: fakeIndexedDb })
}

const uninstallFakeIndexedDb = () => {
  if (originalIndexedDb === undefined) delete (globalThis as { indexedDB?: unknown }).indexedDB
  else Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: originalIndexedDb })
}

describe('durable checkpoint persistence', () => {
  it('allocates monotonic sequences per assessment scope', async () => {
    const store = createMemoryCheckpointStore()
    const first = await store.append({ scopeType: 'scale', scopeId: 'assessment-1', payload: { itemCode: 'a' } })
    const second = await store.append({ scopeType: 'scale', scopeId: 'assessment-1', payload: { itemCode: 'b' } })
    const otherScope = await store.append({ scopeType: 'scale', scopeId: 'assessment-2', payload: { itemCode: 'a' } })

    expect([first.sequence, second.sequence, otherScope.sequence]).toEqual([1, 2, 1])
    expect((await store.list('scale', 'assessment-1')).map((record) => record.sequence)).toEqual([1, 2])
  })

  it('only removes records explicitly acknowledged by the server', async () => {
    const store = createMemoryCheckpointStore()
    const scheduler = new CheckpointScheduler(store)
    const transport = vi.fn().mockResolvedValue({ acceptedSequence: 1 })
    await scheduler.enqueue({ scopeType: 'questionnaire', scopeId: 'qa-1', payload: { formItemId: 'a' } }, transport)
    await scheduler.enqueue({ scopeType: 'questionnaire', scopeId: 'qa-1', payload: { formItemId: 'b' } }, transport)

    await scheduler.flush('questionnaire', 'qa-1')

    expect(transport).toHaveBeenCalledTimes(1)
    expect((await store.list('questionnaire', 'qa-1')).map((record) => record.sequence)).toEqual([2])
  })

  it('keeps a failed batch for an identical retry and records attempts', async () => {
    const store = createMemoryCheckpointStore()
    const scheduler = new CheckpointScheduler(store)
    const transport = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ acceptedIds: [] })
    await scheduler.enqueue({ scopeType: 'cognitive', scopeId: 'session-1', payload: { trialIndex: 7 } }, transport)

    await expect(scheduler.flush('cognitive', 'session-1')).rejects.toThrow('network')
    const pending = await store.list('cognitive', 'session-1')
    expect(pending).toHaveLength(1)
    expect(pending[0].attempts).toBe(1)
  })

  it('surfaces structured transport failures and blocks a conflicted scope', async () => {
    const store = createMemoryCheckpointStore()
    const scheduler = new CheckpointScheduler(store)
    const conflict = new CheckpointTransportError('trial conflict', { status: 409, code: 409 })
    const transport = vi.fn().mockRejectedValue(conflict)
    const onError = vi.fn((error: unknown) => scheduler.block('cognitive', 'session-2', error))
    scheduler.register('cognitive', 'session-2', transport, { onError, maxBatchSize: 10 })

    await scheduler.enqueue({ scopeType: 'cognitive', scopeId: 'session-2', payload: { trialIndex: 4 } }, transport)
    await expect(scheduler.flush('cognitive', 'session-2')).rejects.toBe(conflict)

    expect(onError).toHaveBeenCalledWith(conflict)
    expect(scheduler.isBlocked('cognitive', 'session-2')).toBe(true)
    expect(await store.count('cognitive', 'session-2')).toBe(1)
    await expect(
      scheduler.enqueue({ scopeType: 'cognitive', scopeId: 'session-2', payload: { trialIndex: 5 } }, transport),
    ).rejects.toBe(conflict)
  })
})

describe('IndexedDbCheckpointStore failure handling', () => {
  beforeEach(() => installFakeIndexedDb())
  afterEach(() => uninstallFakeIndexedDb())

  it('fails closed after a request error and does not hide an existing pending record', async () => {
    const store = new IndexedDbCheckpointStore()
    const record = await store.append({
      scopeType: 'cognitive',
      scopeId: 'session-1',
      payload: { trialIndex: 2 },
    })

    fakeIndexedDb.failNextRead = new Error('injected IndexedDB read failure')
    await expect(store.list('cognitive', 'session-1')).rejects.toThrow('injected IndexedDB read failure')

    const pending = await store.list('cognitive', 'session-1')
    expect(pending).toEqual([expect.objectContaining({ id: record.id, sequence: 1 })])
  })

  it('sweeps expired records globally when a new store opens', async () => {
    const store = new IndexedDbCheckpointStore()
    await store.append({
      scopeType: 'scale',
      scopeId: 'abandoned-assessment',
      payload: { itemCode: 'old' },
      createdAt: Date.now() - CHECKPOINT_TTL_MS - 1,
    })
    const fresh = await store.append({
      scopeType: 'scale',
      scopeId: 'active-assessment',
      payload: { itemCode: 'current' },
    })

    const reopenedStore = new IndexedDbCheckpointStore()
    const pending = await reopenedStore.list('scale', 'active-assessment')
    expect(pending).toEqual([expect.objectContaining({ id: fresh.id })])

    const database = [...fakeIndexedDb.databases.values()][0]
    const records = [...(database.stores.get('pending')?.values() ?? [])]
    expect(records.some((record) => record.scopeId === 'abandoned-assessment')).toBe(false)
  })
})
