/**
 * Durable local state for final-only instrument attempts.
 *
 * Final-only pages never enqueue answer checkpoints.  They update this store
 * synchronously from the user's point of view and only read the store again
 * when the instrument boundary is submitted.  The existing checkpoint store
 * remains available for LEGACY compatibility code.
 */

export type FinalDraftInstrument =
  | 'scale'
  | 'cognitive'
  | 'questionnaire-form-section'
  | 'composite-form-section'
  | 'situational'

export type FinalDraftStatus =
  | 'DRAFT'
  | 'SUBMITTING'
  | 'RETRY_PENDING'
  | 'CONFLICT'
  | 'COMPLETED'

export interface FinalDraftMeta {
  draftKey: string
  instrument: FinalDraftInstrument
  attemptId: string
  attemptEpoch: number
  definitionHash: string
  /** Frozen identity for standalone final-only runtimes. */
  instrumentKey?: string
  instrumentVersion?: string
  compiledRuntimeHash?: string
  contextSnapshotHash: string | null
  deliveryMode: 'final_only'
  submissionId: string
  status: FinalDraftStatus
  createdAt: number
  updatedAt: number
  submittedAt?: number | null
  errorCode?: string | null
  errorMessage?: string | null
  /** Optional, non-identity instrument metadata. Never participates in sameIdentity(). */
  instrumentMetadata?: Record<string, unknown>
}

export interface FinalDraftAnswer {
  draftKey: string
  itemKey: string
  value: unknown
  updatedAt: number
}

export interface FinalDraftTrial {
  draftKey: string
  trialIndex: number
  payload: unknown
  createdAt: number
}

export interface FinalDraftSnapshot {
  meta: FinalDraftMeta
  answers: FinalDraftAnswer[]
  trials: FinalDraftTrial[]
}

export class FinalDraftStorageError extends Error {
  readonly code = 'FINAL_DRAFT_STORAGE_ERROR'

  constructor(message: string, options?: { cause?: unknown }) {
    super(message)
    this.name = 'FinalDraftStorageError'
    if (options?.cause !== undefined) Object.defineProperty(this, 'cause', { value: options.cause, enumerable: false })
  }
}

export class FinalDraftIdentityConflictError extends Error {
  readonly code = 'FINAL_DRAFT_IDENTITY_CONFLICT'
  readonly existing: FinalDraftMeta

  constructor(existing: FinalDraftMeta) {
    super('本地草稿与当前测评定义或 attempt 版本不一致')
    this.name = 'FinalDraftIdentityConflictError'
    this.existing = existing
  }
}

export class FinalDraftTrialConflictError extends Error {
  readonly code = 'FINAL_DRAFT_TRIAL_CONFLICT'

  constructor(trialIndex: number) {
    super(`本地认知试次 ${trialIndex} 已存在且内容不同`)
    this.name = 'FinalDraftTrialConflictError'
  }
}

const DATABASE_NAME = 'eduk12-final-drafts-v1'
const DATABASE_VERSION = 1
const META_STORE = 'draftMeta'
const ANSWER_STORE = 'draftAnswers'
const TRIAL_STORE = 'draftTrials'
const DRAFT_INDEX = 'draftKey'

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
    reject(new FinalDraftStorageError('IndexedDB 不可用'))
    return
  }
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
  request.onupgradeneeded = () => {
    const database = request.result
    const meta = database.objectStoreNames.contains(META_STORE)
      ? request.transaction!.objectStore(META_STORE)
      : database.createObjectStore(META_STORE, { keyPath: 'draftKey' })
    const answers = database.objectStoreNames.contains(ANSWER_STORE)
      ? request.transaction!.objectStore(ANSWER_STORE)
      : database.createObjectStore(ANSWER_STORE, { keyPath: ['draftKey', 'itemKey'] })
    const trials = database.objectStoreNames.contains(TRIAL_STORE)
      ? request.transaction!.objectStore(TRIAL_STORE)
      : database.createObjectStore(TRIAL_STORE, { keyPath: ['draftKey', 'trialIndex'] })
    if (!answers.indexNames.contains(DRAFT_INDEX)) answers.createIndex(DRAFT_INDEX, 'draftKey', { unique: false })
    if (!trials.indexNames.contains(DRAFT_INDEX)) trials.createIndex(DRAFT_INDEX, 'draftKey', { unique: false })
    // Touching the meta store here keeps upgrades explicit if a future version
    // adds indexes without changing the public draft contract.
    void meta
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error || new FinalDraftStorageError('IndexedDB 打开失败'))
  request.onblocked = () => reject(new FinalDraftStorageError('IndexedDB 正在被旧页面占用'))
})

const serialize = (value: unknown): string => {
  try { return JSON.stringify(value) } catch { return String(value) }
}

const sameIdentity = (left: FinalDraftMeta, right: FinalDraftMeta) => (
  left.attemptId === right.attemptId
  && left.attemptEpoch === right.attemptEpoch
  && left.definitionHash === right.definitionHash
  && left.instrumentKey === right.instrumentKey
  && left.instrumentVersion === right.instrumentVersion
  && left.compiledRuntimeHash === right.compiledRuntimeHash
  && left.contextSnapshotHash === right.contextSnapshotHash
  && left.instrument === right.instrument
  && left.deliveryMode === right.deliveryMode
)

export interface FinalDraftStore {
  get(draftKey: string): Promise<FinalDraftMeta | null>
  ensure(meta: FinalDraftMeta): Promise<FinalDraftMeta>
  update(meta: FinalDraftMeta): Promise<FinalDraftMeta>
  setInstrumentMetadata(draftKey: string, metadata: Record<string, unknown>): Promise<FinalDraftMeta | null>
  putAnswer(answer: FinalDraftAnswer): Promise<void>
  listAnswers(draftKey: string): Promise<FinalDraftAnswer[]>
  putTrial(trial: FinalDraftTrial): Promise<void>
  listTrials(draftKey: string): Promise<FinalDraftTrial[]>
  setStatus(draftKey: string, status: FinalDraftStatus, error?: { code?: string | null; message?: string | null }): Promise<FinalDraftMeta | null>
  snapshot(draftKey: string): Promise<FinalDraftSnapshot | null>
  delete(draftKey: string): Promise<void>
}

class MemoryFinalDraftStore implements FinalDraftStore {
  private readonly metas = new Map<string, FinalDraftMeta>()
  private readonly answers = new Map<string, FinalDraftAnswer>()
  private readonly trials = new Map<string, FinalDraftTrial>()

  async get(draftKey: string) { return this.metas.get(draftKey) ?? null }

  async ensure(meta: FinalDraftMeta) {
    const existing = this.metas.get(meta.draftKey)
    if (existing && !sameIdentity(existing, meta)) throw new FinalDraftIdentityConflictError(existing)
    if (existing) return existing
    this.metas.set(meta.draftKey, { ...meta })
    return meta
  }

  async update(meta: FinalDraftMeta) {
    const existing = this.metas.get(meta.draftKey)
    if (existing && !sameIdentity(existing, meta)) throw new FinalDraftIdentityConflictError(existing)
    this.metas.set(meta.draftKey, { ...meta })
    return meta
  }

  async setInstrumentMetadata(draftKey: string, metadata: Record<string, unknown>) {
    const current = this.metas.get(draftKey)
    if (!current) return null
    const next = {
      ...current,
      instrumentMetadata: { ...(current.instrumentMetadata ?? {}), ...metadata },
      updatedAt: Date.now(),
    }
    this.metas.set(draftKey, next)
    return next
  }

  async putAnswer(answer: FinalDraftAnswer) {
    this.answers.set(`${answer.draftKey}:${answer.itemKey}`, { ...answer })
  }

  async listAnswers(draftKey: string) {
    return [...this.answers.values()].filter((answer) => answer.draftKey === draftKey).sort((a, b) => a.itemKey.localeCompare(b.itemKey))
  }

  async putTrial(trial: FinalDraftTrial) {
    const key = `${trial.draftKey}:${trial.trialIndex}`
    const existing = this.trials.get(key)
    if (existing && serialize(existing.payload) !== serialize(trial.payload)) throw new FinalDraftTrialConflictError(trial.trialIndex)
    if (!existing) this.trials.set(key, { ...trial })
  }

  async listTrials(draftKey: string) {
    return [...this.trials.values()].filter((trial) => trial.draftKey === draftKey).sort((a, b) => a.trialIndex - b.trialIndex)
  }

  async setStatus(draftKey: string, status: FinalDraftStatus, error?: { code?: string | null; message?: string | null }) {
    const current = this.metas.get(draftKey)
    if (!current) return null
    const next = { ...current, status, updatedAt: Date.now(), errorCode: error?.code ?? null, errorMessage: error?.message ?? null }
    this.metas.set(draftKey, next)
    return next
  }

  async snapshot(draftKey: string) {
    const meta = await this.get(draftKey)
    return meta ? { meta, answers: await this.listAnswers(draftKey), trials: await this.listTrials(draftKey) } : null
  }

  async delete(draftKey: string) {
    this.metas.delete(draftKey)
    for (const key of [...this.answers.keys()]) if (key.startsWith(`${draftKey}:`)) this.answers.delete(key)
    for (const key of [...this.trials.keys()]) if (key.startsWith(`${draftKey}:`)) this.trials.delete(key)
  }
}

export class IndexedDbFinalDraftStore implements FinalDraftStore {
  private databasePromise: Promise<IDBDatabase> | null = null

  private async database() {
    if (!this.databasePromise) {
      this.databasePromise = openDatabase().catch((error) => {
        this.databasePromise = null
        throw new FinalDraftStorageError('无法打开本地测评草稿存储', { cause: error })
      })
    }
    return this.databasePromise
  }

  private async run<T>(names: string[], mode: IDBTransactionMode, callback: (transaction: IDBTransaction) => Promise<T>): Promise<T> {
    try {
      const database = await this.database()
      const transaction = database.transaction(names, mode)
      // Register completion handlers before issuing the first request. The
      // browser may auto-commit immediately after the last request callback;
      // registering afterwards can miss `oncomplete` and hang the caller.
      const done = transactionDone(transaction)
      try {
        const result = await callback(transaction)
        await done
        return result
      } catch (error) {
        // A request callback can fail before the transaction emits its abort
        // event. Consume that completion promise so quota/permission errors do
        // not become an unhandled rejection in the browser.
        await done.catch(() => undefined)
        throw error
      }
    } catch (error) {
      if (error instanceof FinalDraftIdentityConflictError || error instanceof FinalDraftTrialConflictError) throw error
      throw new FinalDraftStorageError('本地测评草稿读写失败，请检查浏览器存储权限', { cause: error })
    }
  }

  async get(draftKey: string) {
    return this.run<FinalDraftMeta | null>([META_STORE], 'readonly', async (transaction) => (
      (await requestResult<FinalDraftMeta | undefined>(transaction.objectStore(META_STORE).get(draftKey))) ?? null
    ))
  }

  async ensure(meta: FinalDraftMeta) {
    const existing = await this.get(meta.draftKey)
    if (existing && !sameIdentity(existing, meta)) throw new FinalDraftIdentityConflictError(existing)
    if (existing) return existing
    return this.update(meta)
  }

  async update(meta: FinalDraftMeta) {
    return this.run<FinalDraftMeta>([META_STORE], 'readwrite', async (transaction) => {
      transaction.objectStore(META_STORE).put({ ...meta })
      return meta
    })
  }

  async setInstrumentMetadata(draftKey: string, metadata: Record<string, unknown>) {
    return this.run<FinalDraftMeta | null>([META_STORE], 'readwrite', async (transaction) => {
      const store = transaction.objectStore(META_STORE)
      const current = await requestResult<FinalDraftMeta | undefined>(store.get(draftKey))
      if (!current) return null
      const next = {
        ...current,
        instrumentMetadata: { ...(current.instrumentMetadata ?? {}), ...metadata },
        updatedAt: Date.now(),
      }
      store.put(next)
      return next
    })
  }

  async putAnswer(answer: FinalDraftAnswer) {
    await this.run<void>([ANSWER_STORE], 'readwrite', async (transaction) => {
      transaction.objectStore(ANSWER_STORE).put({ ...answer })
    })
  }

  async listAnswers(draftKey: string) {
    return this.run<FinalDraftAnswer[]>([ANSWER_STORE], 'readonly', async (transaction) => (
      (await requestResult<FinalDraftAnswer[]>(transaction.objectStore(ANSWER_STORE).index(DRAFT_INDEX).getAll(draftKey)))
        .sort((a, b) => a.itemKey.localeCompare(b.itemKey))
    ))
  }

  async putTrial(trial: FinalDraftTrial) {
    await this.run<void>([TRIAL_STORE], 'readwrite', async (transaction) => {
      const store = transaction.objectStore(TRIAL_STORE)
      const key: [string, number] = [trial.draftKey, trial.trialIndex]
      const existing = await requestResult<FinalDraftTrial | undefined>(store.get(key))
      if (existing && serialize(existing.payload) !== serialize(trial.payload)) throw new FinalDraftTrialConflictError(trial.trialIndex)
      if (!existing) store.put({ ...trial })
    })
  }

  async listTrials(draftKey: string) {
    return this.run<FinalDraftTrial[]>([TRIAL_STORE], 'readonly', async (transaction) => (
      (await requestResult<FinalDraftTrial[]>(transaction.objectStore(TRIAL_STORE).index(DRAFT_INDEX).getAll(draftKey)))
        .sort((a, b) => a.trialIndex - b.trialIndex)
    ))
  }

  async setStatus(draftKey: string, status: FinalDraftStatus, error?: { code?: string | null; message?: string | null }) {
    return this.run<FinalDraftMeta | null>([META_STORE], 'readwrite', async (transaction) => {
      const store = transaction.objectStore(META_STORE)
      const current = await requestResult<FinalDraftMeta | undefined>(store.get(draftKey))
      if (!current) return null
      const next = { ...current, status, updatedAt: Date.now(), errorCode: error?.code ?? null, errorMessage: error?.message ?? null }
      store.put(next)
      return next
    })
  }

  async snapshot(draftKey: string) {
    const [meta, answers, trials] = await Promise.all([this.get(draftKey), this.listAnswers(draftKey), this.listTrials(draftKey)])
    return meta ? { meta, answers, trials } : null
  }

  async delete(draftKey: string) {
    await this.run<void>([META_STORE, ANSWER_STORE, TRIAL_STORE], 'readwrite', async (transaction) => {
      transaction.objectStore(META_STORE).delete(draftKey)
      for (const answer of await requestResult<FinalDraftAnswer[]>(transaction.objectStore(ANSWER_STORE).index(DRAFT_INDEX).getAll(draftKey))) {
        transaction.objectStore(ANSWER_STORE).delete([answer.draftKey, answer.itemKey])
      }
      for (const trial of await requestResult<FinalDraftTrial[]>(transaction.objectStore(TRIAL_STORE).index(DRAFT_INDEX).getAll(draftKey))) {
        transaction.objectStore(TRIAL_STORE).delete([trial.draftKey, trial.trialIndex])
      }
    })
  }
}

export const createFinalDraftStore = (): FinalDraftStore => hasIndexedDb()
  ? new IndexedDbFinalDraftStore()
  : new MemoryFinalDraftStore()

export const finalDraftStore = createFinalDraftStore()

export const createFinalDraftMeta = (input: Omit<FinalDraftMeta, 'createdAt' | 'updatedAt' | 'status'> & Partial<Pick<FinalDraftMeta, 'status'>>) => {
  const now = Date.now()
  return {
    ...input,
    status: input.status ?? 'DRAFT',
    createdAt: now,
    updatedAt: now,
  } satisfies FinalDraftMeta
}
