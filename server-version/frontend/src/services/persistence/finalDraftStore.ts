import {mutateCognitiveRawArchive,type CognitiveRawArchiveState,type CognitiveArchiveIdentity,type CognitiveArchiveMutation} from './cognitiveRawArchiveState'
/**
 * Durable local state for final-only instrument attempts.
 *
 * Final-only pages never enqueue answer checkpoints. They update this store
 * from the user's point of view and only submit a sealed, immutable snapshot
 * at the instrument boundary. The existing checkpoint store remains available
 * for LEGACY compatibility code.
 */

export type FinalDraftInstrument =
  | 'scale'
  | 'cognitive'
  | 'questionnaire-form-section'
  | 'composite-form-section'
  | 'composite-whole'
  | 'situational'

export type FinalDraftStatus =
  | 'DRAFT'
  | 'SUBMITTING'
  | 'RETRY_PENDING'
  | 'CONFLICT'
  | 'COMPLETED'

export interface FinalDraftSealedSubmission {
  schemaVersion: 1
  sealedAt: number
  payload: unknown
}

export type RejectedFormSubmission = {
  code: 'FORM_ANSWER_INVALID'
  submissionId: string
  nextSubmissionId: string
}

const reopenRejectedForm = (meta: FinalDraftMeta, rejection: RejectedFormSubmission): FinalDraftMeta => {
  assertNotExpired(meta)
  if (rejection.code !== 'FORM_ANSWER_INVALID'
    || !['questionnaire-form-section', 'composite-form-section'].includes(meta.instrument)
    || !['SUBMITTING', 'RETRY_PENDING'].includes(meta.status)
    || !meta.sealedSubmission || meta.submissionId !== rejection.submissionId
    || !rejection.nextSubmissionId || rejection.nextSubmissionId === meta.submissionId) {
    throw new FinalDraftNotWritableError(meta.status)
  }
  return { ...meta, status: 'DRAFT', submissionId: rejection.nextSubmissionId, sealedSubmission: undefined,
    errorCode: null, errorMessage: null, updatedAt: Date.now() }
}

/** Populated only from a verified Training runner response, never browser history.
 * Local storage is crash/replay protection, not a server anti-tampering boundary. */
export interface TrainingDraftRetention {
  schemaVersion: 1
  attemptId: string
  attemptEpoch: number
  sessionId: string
  sessionEpoch: number
  snapshotHash: string
  ttlHours: number
  lastWriteAt: number
  expiredAt?: number
}

export const trainingCognitiveDraftKey = (binding: Pick<TrainingDraftRetention, 'attemptId' | 'attemptEpoch' | 'sessionId' | 'sessionEpoch'>) =>
  `training:cognitive:${JSON.stringify([binding.attemptId, binding.attemptEpoch, binding.sessionId, binding.sessionEpoch])}`

export class FinalDraftExpiredError extends Error {
  readonly code = 'FINAL_DRAFT_EXPIRED'
  constructor() { super('本地草稿已过期，请取得服务器授权的新 attempt 后再开始'); this.name = 'FinalDraftExpiredError' }
}

export interface FinalDraftMeta {
  /** Optional native raw lifecycle; core completion must not delete an unconfirmed archive. */
  cognitiveRawArchive?: CognitiveRawArchiveState
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
  /** Survey-only, local retention clock. Never sent as part of the FINAL. */
  surveyRetention?: { schemaVersion: 1; lastWriteAt: number }
  trainingRetention?: TrainingDraftRetention
  submittedAt?: number | null
  errorCode?: string | null
  errorMessage?: string | null
  /**
   * Immutable logical FINAL payload. Once present, DRAFT mutations are rejected
   * and retries must replay this exact structured-clone value.
   */
  sealedSubmission?: FinalDraftSealedSubmission
  /** Optional, non-identity instrument metadata. Never participates in sameIdentity(). */
  instrumentMetadata?: Record<string, unknown>
}

export interface FinalDraftAnswer {
  draftKey: string
  itemKey: string
  value: unknown
  updatedAt: number
}

export type FinalDraftWriteIdentity = Pick<FinalDraftMeta, 'draftKey'|'instrument'|'attemptId'|'attemptEpoch'|'definitionHash'|'submissionId'>

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

export interface FinalDraftSealResult<T> {
  meta: FinalDraftMeta
  payload: T
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

export class FinalDraftNotWritableError extends Error {
  readonly code = 'FINAL_DRAFT_NOT_WRITABLE'
  readonly status: FinalDraftStatus

  constructor(status: FinalDraftStatus) {
    super(status === 'DRAFT' ? '本地草稿已经封存，不能继续修改' : '本地草稿已进入提交或终态，不能继续修改')
    this.name = 'FinalDraftNotWritableError'
    this.status = status
  }
}

export class FinalDraftPendingWithoutSealError extends Error {
  readonly code = 'FINAL_DRAFT_PENDING_WITHOUT_SEAL'
  readonly status: FinalDraftStatus

  constructor(status: FinalDraftStatus) {
    super('检测到旧版未确认提交状态；必须先核对服务器终态，不能重新生成提交内容')
    this.name = 'FinalDraftPendingWithoutSealError'
    this.status = status
  }
}

export class FinalDraftSealRequiredError extends Error {
  readonly code = 'FINAL_DRAFT_SEAL_REQUIRED'
  readonly nextStatus: FinalDraftStatus

  constructor(nextStatus: FinalDraftStatus) {
    super('只有已封存的逻辑 FINAL 才能进入重试、冲突或完成状态')
    this.name = 'FinalDraftSealRequiredError'
    this.nextStatus = nextStatus
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
    // Object values are schema-flexible: sealedSubmission adds no new store/index.
    void meta
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error || new FinalDraftStorageError('IndexedDB 打开失败'))
  request.onblocked = () => reject(new FinalDraftStorageError('IndexedDB 正在被旧页面占用'))
})

const serialize = (value: unknown): string => {
  try { return JSON.stringify(value) } catch { return String(value) }
}

const cloneValue = <T>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
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
  && serialize(trainingIdentity(left.trainingRetention)) === serialize(trainingIdentity(right.trainingRetention))
)

/** Optional CAS ownership, checked in the same transaction as the write. */
export function assertFinalDraftWriteIdentity(current:FinalDraftMeta,expected?:FinalDraftWriteIdentity){
 if(expected&&(current.draftKey!==expected.draftKey||current.instrument!==expected.instrument
  ||current.attemptId!==expected.attemptId||current.attemptEpoch!==expected.attemptEpoch
  ||current.definitionHash!==expected.definitionHash||current.submissionId!==expected.submissionId))
  throw new FinalDraftIdentityConflictError(current)
}

const assertNotExpired = (meta: FinalDraftMeta) => {
  if (meta.trainingRetention?.expiredAt !== undefined) throw new FinalDraftExpiredError()
}

const assertWritable = (meta: FinalDraftMeta) => {
  assertNotExpired(meta)
  if (meta.status !== 'DRAFT' || meta.sealedSubmission) throw new FinalDraftNotWritableError(meta.status)
}

const assertStatusTransition = (meta: FinalDraftMeta, nextStatus: FinalDraftStatus) => {
  assertNotExpired(meta)
  if (nextStatus === 'DRAFT' && meta.sealedSubmission) throw new FinalDraftNotWritableError(meta.status)
  // SUBMITTING without a seal is retained only as a compatibility representation
  // for pre-FE-03A clients. New submission paths enter SUBMITTING exclusively via
  // sealForSubmission(). A pre-seal validation failure must remain writable DRAFT.
  if (
    meta.status === 'DRAFT'
    && !meta.sealedSubmission
    && nextStatus !== 'DRAFT'
    && nextStatus !== 'SUBMITTING'
  ) throw new FinalDraftSealRequiredError(nextStatus)
}

const sortedAnswers = (answers: FinalDraftAnswer[]) => answers.sort((a, b) => a.itemKey.localeCompare(b.itemKey))
const sortedTrials = (trials: FinalDraftTrial[]) => trials.sort((a, b) => a.trialIndex - b.trialIndex)

const trainingIdentity = (binding?: TrainingDraftRetention) => binding
  ? { ...binding, lastWriteAt: undefined, expiredAt: undefined } : undefined
const hasTrainingRetention = (meta: FinalDraftMeta) => {
  const b = meta.trainingRetention
  return !!b && b.schemaVersion === 1 && meta.instrument === 'cognitive'
    && meta.surveyRetention === undefined && meta.deliveryMode === 'final_only'
    && typeof b.attemptId === 'string' && b.attemptId.length > 0
    && typeof b.sessionId === 'string' && b.sessionId.length > 0
    && typeof b.snapshotHash === 'string' && b.snapshotHash.length > 0
    && Number.isSafeInteger(b.attemptEpoch) && b.attemptEpoch >= 1
    && Number.isSafeInteger(b.sessionEpoch) && b.sessionEpoch >= 1
    && Number.isInteger(b.ttlHours) && b.ttlHours >= 1 && b.ttlHours <= 48
    && meta.attemptId === b.sessionId && meta.attemptEpoch === b.sessionEpoch
    && meta.draftKey === trainingCognitiveDraftKey(b)
}
const trainingExpired = (meta: FinalDraftMeta, now: number) => {
  if (!hasTrainingRetention(meta) || meta.status !== 'DRAFT' || meta.sealedSubmission || (meta.cognitiveRawArchive && !meta.cognitiveRawArchive.archiveConfirmed)) return false
  const b = meta.trainingRetention!
  return b.expiredAt === undefined && Number.isFinite(now) && now > 0
    && Number.isFinite(b.lastWriteAt) && b.lastWriteAt > 0 && b.lastWriteAt <= now
    && now - b.lastWriteAt > b.ttlHours * 3600000
}
const trainingTombstone = (meta: FinalDraftMeta, now: number): FinalDraftMeta => ({
  draftKey: meta.draftKey, instrument: meta.instrument, attemptId: meta.attemptId,
  attemptEpoch: meta.attemptEpoch, definitionHash: meta.definitionHash,
  instrumentKey: meta.instrumentKey, instrumentVersion: meta.instrumentVersion,
  compiledRuntimeHash: meta.compiledRuntimeHash, contextSnapshotHash: meta.contextSnapshotHash,
  deliveryMode: meta.deliveryMode, submissionId: meta.submissionId,
  status: 'DRAFT', createdAt: meta.createdAt, updatedAt: now,
  trainingRetention: { ...meta.trainingRetention!, expiredAt: now },
})

export const SURVEY_COGNITIVE_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const SURVEY_SCAN_LIMIT = 100
export type SurveyCognitiveDraftPage = { sessionIds: string[]; nextCursor: string | null }

const isCognitiveDraft = (meta: FinalDraftMeta) => meta.instrument === 'cognitive'
  && typeof meta.attemptId === 'string' && meta.attemptId.length > 0
  && meta.draftKey === `cognitive:${meta.attemptId}`
const hasSurveyRetention = (meta: FinalDraftMeta) => isCognitiveDraft(meta)
  && meta.surveyRetention?.schemaVersion === 1
const stampRetentionWrite = (meta: FinalDraftMeta): FinalDraftMeta => hasTrainingRetention(meta)
  && meta.status === 'DRAFT' && !meta.sealedSubmission && meta.trainingRetention!.expiredAt === undefined
  ? { ...meta, trainingRetention: { ...meta.trainingRetention!, lastWriteAt: Date.now() } } : hasSurveyRetention(meta)
  && meta.status === 'DRAFT' && !meta.sealedSubmission
  ? { ...meta, surveyRetention: { schemaVersion: 1, lastWriteAt: Date.now() } } : meta
const withExistingRetention = (next: FinalDraftMeta, existing?: FinalDraftMeta) => existing
  ? { ...next, surveyRetention: existing.surveyRetention, trainingRetention: existing.trainingRetention } : next
const sameDraftContent = (left: FinalDraftMeta, right: FinalDraftMeta) => {
  const content = (meta: FinalDraftMeta) => ({ ...meta, updatedAt: undefined, surveyRetention: undefined, trainingRetention: trainingIdentity(meta.trainingRetention) })
  return serialize(content(left)) === serialize(content(right))
}
const stampChangedRetentionWrite = (current: FinalDraftMeta | undefined, next: FinalDraftMeta) => {
  // Never serialize other products or a potentially large immutable FINAL just
  // to maintain Survey's small, writable-draft clock.
  if ((!hasSurveyRetention(next) && !hasTrainingRetention(next)) || next.status !== 'DRAFT' || next.sealedSubmission) return next
  return current && sameDraftContent(current, next) ? next : stampRetentionWrite(next)
}
// Only explicit Survey ownership may migrate a legacy record. Its old meta/trial
// timestamps predate this write-clock contract, so never infer its age from them.
const surveyExpiry = (meta: FinalDraftMeta, legacySurvey: boolean, now: number): 'keep' | 'migrate' | 'delete' => {
  if (!isCognitiveDraft(meta) || meta.status !== 'DRAFT' || meta.sealedSubmission
    || (!hasSurveyRetention(meta) && (!legacySurvey || meta.surveyRetention !== undefined))
    || !Number.isFinite(now) || now <= 0) return 'keep'
  const lastWriteAt = meta.surveyRetention?.lastWriteAt
  if (typeof lastWriteAt !== 'number' || !Number.isFinite(lastWriteAt) || lastWriteAt <= 0 || lastWriteAt > now) return 'migrate'
  return now - lastWriteAt > SURVEY_COGNITIVE_DRAFT_TTL_MS ? 'delete' : 'keep'
}

const prepareAnswerReplacement = (expected: FinalDraftMeta, answers: FinalDraftAnswer[], metadata?: Record<string, unknown>) => {
  if (expected.instrument === 'cognitive') throw new FinalDraftStorageError('认知试次不支持答案集合恢复')
  const keys = new Set<string>()
  for (const answer of answers) {
    if (answer.draftKey !== expected.draftKey || !answer.itemKey || keys.has(answer.itemKey)) {
      throw new FinalDraftStorageError('恢复答案的草稿身份或题目键无效')
    }
    keys.add(answer.itemKey)
  }
  // Clone every input before opening the mutation boundary. A clone failure
  // must not leave new-only answer keys or half-updated timing metadata.
  return { expected: cloneValue(expected), answers: answers.map(cloneValue), metadata: metadata === undefined ? undefined : cloneValue(metadata) }
}

const assertReplacementIdentity = (current: FinalDraftMeta, expected: FinalDraftMeta) => {
  assertWritable(current)
  if (!sameIdentity(current, expected) || current.submissionId !== expected.submissionId) throw new FinalDraftIdentityConflictError(current)
}
const replacementMeta = (current: FinalDraftMeta, metadata?: Record<string, unknown>): FinalDraftMeta => ({
  ...current, updatedAt: Date.now(),
  ...(metadata === undefined ? {} : { instrumentMetadata: { ...current.instrumentMetadata, ...metadata } }),
})

export interface FinalDraftStore {
  listTrainingCognitiveDrafts(after?: string | null): Promise<{ draftKeys: string[]; nextCursor: string | null }>
  expireTrainingCognitiveDraft(draftKey: string, now: number): Promise<boolean>
  listSurveyCognitiveDrafts(legacySessionIds: string[], after?: string | null): Promise<SurveyCognitiveDraftPage>
  expireSurveyCognitiveDraft(sessionId: string, legacySurvey: boolean, now: number): Promise<boolean>
  get(draftKey: string): Promise<FinalDraftMeta | null>
  ensure(meta: FinalDraftMeta): Promise<FinalDraftMeta>
  update(meta: FinalDraftMeta): Promise<FinalDraftMeta>
  setInstrumentMetadata(draftKey: string, metadata: Record<string, unknown>): Promise<FinalDraftMeta | null>
  /** Answer and optional timing metadata commit together under the seal lock. */
  putAnswer(answer: FinalDraftAnswer, metadata?: Record<string, unknown>): Promise<void>
  /** Replaces the complete answer set and optional timing metadata for one draft
   * in a single commit. Whole questionnaires must include every unit in this key. */
  replaceAnswers(expected: FinalDraftMeta, answers: FinalDraftAnswer[], metadata?: Record<string, unknown>): Promise<void>
  replaceSituationalAnswers(expected: FinalDraftMeta, answers: FinalDraftAnswer[]): Promise<void>
  listAnswers(draftKey: string): Promise<FinalDraftAnswer[]>
  deleteAnswers(draftKey: string, itemKeys: string[]): Promise<void>
  putTrial(trial: FinalDraftTrial, expected?: FinalDraftWriteIdentity): Promise<void>
  listTrials(draftKey: string): Promise<FinalDraftTrial[]>
  setStatus(draftKey: string, status: FinalDraftStatus, error?: { code?: string | null; message?: string | null }, expected?: FinalDraftWriteIdentity): Promise<FinalDraftMeta | null>
  reopenRejectedForm(draftKey: string, rejection: RejectedFormSubmission): Promise<FinalDraftMeta | null>
  snapshot(draftKey: string): Promise<FinalDraftSnapshot | null>
  sealForSubmission<T>(draftKey: string, buildPayload: (snapshot: FinalDraftSnapshot) => T, expected?: FinalDraftWriteIdentity): Promise<FinalDraftSealResult<T> | null>
  mutateCognitiveArchive(draftKey:string,identity:CognitiveArchiveIdentity,mutation:CognitiveArchiveMutation):Promise<FinalDraftMeta>
  delete(draftKey: string, expected?: FinalDraftWriteIdentity): Promise<void>
}

class MemoryFinalDraftStore implements FinalDraftStore {
  private readonly metas = new Map<string, FinalDraftMeta>()
  private readonly answers = new Map<string, FinalDraftAnswer>()
  private readonly trials = new Map<string, FinalDraftTrial>()

  async get(draftKey: string) {
    const meta = this.metas.get(draftKey)
    return meta?.trainingRetention ? cloneValue(meta) : meta ?? null
  }

  async listTrainingCognitiveDrafts(after?: string | null) {
    const page = [...this.metas.values()].filter(meta => meta.draftKey.startsWith('training:cognitive:') && (!after || meta.draftKey > after))
      .sort((a, b) => a.draftKey < b.draftKey ? -1 : a.draftKey > b.draftKey ? 1 : 0).slice(0, 100)
    return { draftKeys: page.filter(meta => hasTrainingRetention(meta) && meta.trainingRetention!.expiredAt === undefined).map(meta => meta.draftKey),
      nextCursor: page.length === 100 ? page[99].draftKey : null }
  }

  async expireTrainingCognitiveDraft(draftKey: string, now: number) {
    const meta = this.metas.get(draftKey)
    if (!meta || !trainingExpired(meta, now)) return false
    for (const [key, answer] of this.answers) if (answer.draftKey === draftKey) this.answers.delete(key)
    for (const [key, trial] of this.trials) if (trial.draftKey === draftKey) this.trials.delete(key)
    this.metas.set(draftKey, trainingTombstone(meta, now))
    return true
  }

  async listSurveyCognitiveDrafts(legacySessionIds: string[], after?: string | null) {
    const legacy = new Set(legacySessionIds)
    const page = [...this.metas.values()].filter(meta => !after || meta.draftKey > after)
      .sort((left, right) => left.draftKey < right.draftKey ? -1 : left.draftKey > right.draftKey ? 1 : 0).slice(0, SURVEY_SCAN_LIMIT)
    return { sessionIds: page.filter(meta => isCognitiveDraft(meta)
      && (hasSurveyRetention(meta) || legacy.has(meta.attemptId))).map(meta => meta.attemptId),
    nextCursor: page.length === SURVEY_SCAN_LIMIT ? page[page.length - 1].draftKey : null }
  }

  async expireSurveyCognitiveDraft(sessionId: string, legacySurvey: boolean, now: number) {
    const draftKey = `cognitive:${sessionId}`
    const meta = this.metas.get(draftKey)
    if (!meta) return false
    const action = surveyExpiry(meta, legacySurvey, now)
    if (action === 'migrate') this.metas.set(draftKey, { ...meta, surveyRetention: { schemaVersion: 1, lastWriteAt: now } })
    if (action !== 'delete') return false
    await this.delete(draftKey)
    return true
  }

  async reopenRejectedForm(draftKey: string, rejection: RejectedFormSubmission) {
    const current = this.metas.get(draftKey)
    if (!current) return null
    const next = reopenRejectedForm(current, rejection)
    this.metas.set(draftKey, next)
    return cloneValue(next)
  }

  async ensure(meta: FinalDraftMeta) {
    const existing = this.metas.get(meta.draftKey)
    if (existing) assertNotExpired(existing)
    if (existing && !sameIdentity(existing, meta)) throw new FinalDraftIdentityConflictError(existing)
    if (existing) {
      if (hasSurveyRetention(meta) && existing.surveyRetention === undefined && existing.status === 'DRAFT' && !existing.sealedSubmission) {
        const migrated = stampRetentionWrite({ ...existing, surveyRetention: meta.surveyRetention })
        this.metas.set(meta.draftKey, migrated)
        return migrated
      }
      return existing.trainingRetention ? cloneValue(existing) : existing
    }
    const next = stampRetentionWrite(cloneValue(meta))
    this.metas.set(meta.draftKey, next)
    return next.trainingRetention ? cloneValue(next) : next
  }

  async update(meta: FinalDraftMeta) {
    const existing = this.metas.get(meta.draftKey)
    if (existing) assertNotExpired(existing)
    if (existing && !sameIdentity(existing, meta)) throw new FinalDraftIdentityConflictError(existing)
    if (existing) assertWritable(existing)
    const candidate = withExistingRetention(cloneValue(meta), existing)
    const next = stampChangedRetentionWrite(existing, candidate)
    this.metas.set(meta.draftKey, next)
    return next.trainingRetention ? cloneValue(next) : next
  }

  async setInstrumentMetadata(draftKey: string, metadata: Record<string, unknown>) {
    const current = this.metas.get(draftKey)
    if (!current) return null
    assertWritable(current)
    const next = {
      ...current,
      instrumentMetadata: { ...(current.instrumentMetadata ?? {}), ...cloneValue(metadata) },
      updatedAt: Date.now(),
    }
    const written = stampChangedRetentionWrite(current, next)
    this.metas.set(draftKey, written)
    return written.trainingRetention ? cloneValue(written) : written
  }

  async putAnswer(answer: FinalDraftAnswer, metadata?: Record<string, unknown>) {
    const meta = this.metas.get(answer.draftKey)
    if (!meta) throw new FinalDraftStorageError('本地测评草稿不存在')
    assertWritable(meta)
    const key = `${answer.draftKey}:${answer.itemKey}`
    const previous = this.answers.get(key)
    const nextAnswer = cloneValue(answer)
    const withMetadata = metadata ? { ...meta,
      instrumentMetadata: { ...(meta.instrumentMetadata ?? {}), ...cloneValue(metadata) }, updatedAt: Date.now() } : meta
    const nextMeta = (hasSurveyRetention(meta) || hasTrainingRetention(meta)) && (!previous || serialize(previous.value) !== serialize(answer.value))
      ? stampRetentionWrite(withMetadata) : stampChangedRetentionWrite(meta, withMetadata)
    // Clone and validate both values before either becomes visible.
    this.answers.set(key, nextAnswer)
    if (nextMeta !== meta) this.metas.set(meta.draftKey, nextMeta)
  }

  async replaceAnswers(expected: FinalDraftMeta, answers: FinalDraftAnswer[], metadata?: Record<string, unknown>) {
    const replacement = prepareAnswerReplacement(expected, answers, metadata)
    const current = this.metas.get(replacement.expected.draftKey)
    if (!current) throw new FinalDraftStorageError('本地测评草稿不存在')
    assertReplacementIdentity(current, replacement.expected)
    const next = replacementMeta(current, replacement.metadata)
    // All validation/cloning precedes this synchronous, non-yielding commit.
    for (const [key, answer] of this.answers) if (answer.draftKey === current.draftKey) this.answers.delete(key)
    for (const answer of replacement.answers) this.answers.set(`${answer.draftKey}:${answer.itemKey}`, answer)
    this.metas.set(current.draftKey, next)
  }

  async replaceSituationalAnswers(expected: FinalDraftMeta, answers: FinalDraftAnswer[]) {
    if (expected.instrument !== 'situational') throw new FinalDraftStorageError('只有情境草稿支持情境答案恢复')
    await this.replaceAnswers(expected, answers)
  }

  async listAnswers(draftKey: string) {
    return sortedAnswers([...this.answers.values()].filter((answer) => answer.draftKey === draftKey).map(cloneValue))
  }

  async deleteAnswers(draftKey: string, itemKeys: string[]) {
    const meta = this.metas.get(draftKey)
    if (!meta) throw new FinalDraftStorageError('本地测评草稿不存在')
    assertWritable(meta)
    let changed = false
    for (const itemKey of new Set(itemKeys)) changed = this.answers.delete(`${draftKey}:${itemKey}`) || changed
    if (changed) this.metas.set(draftKey, stampRetentionWrite(meta))
  }

  async putTrial(trial: FinalDraftTrial, expected?: FinalDraftWriteIdentity) {
    const meta = this.metas.get(trial.draftKey)
    if (!meta) throw new FinalDraftStorageError('本地测评草稿不存在')
    assertFinalDraftWriteIdentity(meta,expected)
    assertWritable(meta)
    const key = `${trial.draftKey}:${trial.trialIndex}`
    const existing = this.trials.get(key)
    if (existing && serialize(existing.payload) !== serialize(trial.payload)) throw new FinalDraftTrialConflictError(trial.trialIndex)
    if (!existing) {
      this.trials.set(key, cloneValue(trial))
      this.metas.set(meta.draftKey, stampRetentionWrite(meta))
    }
  }

  async listTrials(draftKey: string) {
    return sortedTrials([...this.trials.values()].filter((trial) => trial.draftKey === draftKey).map(cloneValue))
  }

  async setStatus(draftKey: string, status: FinalDraftStatus, error?: { code?: string | null; message?: string | null }, expected?: FinalDraftWriteIdentity) {
    const current = this.metas.get(draftKey)
    if (!current) return null
    assertFinalDraftWriteIdentity(current,expected)
    assertStatusTransition(current, status)
    const next = { ...current, status, updatedAt: Date.now(), errorCode: error?.code ?? null, errorMessage: error?.message ?? null }
    const written = stampChangedRetentionWrite(current, next)
    this.metas.set(draftKey, written)
    return written.trainingRetention ? cloneValue(written) : written
  }

  async snapshot(draftKey: string) {
    const meta = this.metas.get(draftKey)
    if (!meta) return null
    return {
      meta: cloneValue(meta),
      answers: sortedAnswers([...this.answers.values()].filter((answer) => answer.draftKey === draftKey).map(cloneValue)),
      trials: sortedTrials([...this.trials.values()].filter((trial) => trial.draftKey === draftKey).map(cloneValue)),
    }
  }

  async sealForSubmission<T>(draftKey: string, buildPayload: (snapshot: FinalDraftSnapshot) => T, expected?: FinalDraftWriteIdentity) {
    const current = this.metas.get(draftKey)
    if (!current) return null
    assertFinalDraftWriteIdentity(current,expected)
    assertNotExpired(current)
    if (current.sealedSubmission) {
      return { meta: cloneValue(current), payload: cloneValue(current.sealedSubmission.payload as T) }
    }
    if (current.status !== 'DRAFT') throw new FinalDraftPendingWithoutSealError(current.status)
    const snapshot: FinalDraftSnapshot = {
      meta: cloneValue(current),
      answers: sortedAnswers([...this.answers.values()].filter((answer) => answer.draftKey === draftKey).map(cloneValue)),
      trials: sortedTrials([...this.trials.values()].filter((trial) => trial.draftKey === draftKey).map(cloneValue)),
    }
    const payload = cloneValue(buildPayload(snapshot))
    const sealedAt = Date.now()
    const next: FinalDraftMeta = {
      ...current,
      status: 'SUBMITTING',
      updatedAt: sealedAt,
      errorCode: null,
      errorMessage: null,
      sealedSubmission: { schemaVersion: 1, sealedAt, payload: cloneValue(payload) },
    }
    this.metas.set(draftKey, next)
    return { meta: cloneValue(next), payload }
  }

  async mutateCognitiveArchive(draftKey:string,identity:CognitiveArchiveIdentity,mutation:CognitiveArchiveMutation) {
    const current=this.metas.get(draftKey)
    if(!current)throw new FinalDraftStorageError('本地认知原件不存在')
    assertNotExpired(current)
    const next=mutateCognitiveRawArchive(current,identity,mutation)
    this.metas.set(draftKey,cloneValue(next));return cloneValue(next)
  }

  async delete(draftKey: string, expected?: FinalDraftWriteIdentity) {
    const existing=this.metas.get(draftKey)
    if(existing)assertFinalDraftWriteIdentity(existing,expected)
    if (existing?.trainingRetention?.expiredAt !== undefined || (existing?.cognitiveRawArchive && !existing.cognitiveRawArchive.archiveConfirmed)) return
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
      const done = transactionDone(transaction)
      try {
        const result = await callback(transaction)
        await done
        return result
      } catch (error) {
        try { transaction.abort() } catch { /* Already completed/aborted. */ }
        await done.catch(() => undefined)
        throw error
      }
    } catch (error) {
      if (
        error instanceof FinalDraftExpiredError
        || error instanceof FinalDraftIdentityConflictError
        || error instanceof FinalDraftTrialConflictError
        || error instanceof FinalDraftNotWritableError
        || error instanceof FinalDraftPendingWithoutSealError
        || error instanceof FinalDraftSealRequiredError
      ) throw error
      if (error instanceof FinalDraftStorageError) throw error
      throw new FinalDraftStorageError('本地测评草稿读写失败，请检查浏览器存储权限', { cause: error })
    }
  }

  async get(draftKey: string) {
    return this.run<FinalDraftMeta | null>([META_STORE], 'readonly', async (transaction) => (
      (await requestResult<FinalDraftMeta | undefined>(transaction.objectStore(META_STORE).get(draftKey))) ?? null
    ))
  }

  async listTrainingCognitiveDrafts(after?: string | null) {
    return this.run<{ draftKeys: string[]; nextCursor: string | null }>([META_STORE], 'readonly', transaction => new Promise((resolve, reject) => {
      const prefix = 'training:cognitive:'
      const lower = after?.startsWith(prefix) ? after : prefix
      const request = transaction.objectStore(META_STORE).openCursor(IDBKeyRange.bound(lower, `${prefix}\uffff`, lower !== prefix, false))
      const draftKeys: string[] = []
      let visited = 0
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) { resolve({ draftKeys, nextCursor: null }); return }
        const meta = cursor.value as FinalDraftMeta
        if (hasTrainingRetention(meta) && meta.trainingRetention!.expiredAt === undefined) draftKeys.push(meta.draftKey)
        if (++visited >= 100) { resolve({ draftKeys, nextCursor: String(cursor.key) }); return }
        cursor.continue()
      }
    }))
  }

  async expireTrainingCognitiveDraft(draftKey: string, now: number) {
    return this.run<boolean>([META_STORE, ANSWER_STORE, TRIAL_STORE], 'readwrite', async transaction => {
      const store = transaction.objectStore(META_STORE)
      const meta = await requestResult<FinalDraftMeta | undefined>(store.get(draftKey))
      if (!meta || !trainingExpired(meta, now)) return false
      // Same transaction scope as writes and sealing; discovery is never authoritative.
      // Key cursors avoid materializing answer/trial payloads during cleanup.
      for (const name of [ANSWER_STORE, TRIAL_STORE]) {
        await new Promise<void>((resolve, reject) => {
          const request = transaction.objectStore(name).index(DRAFT_INDEX).openKeyCursor(IDBKeyRange.only(draftKey))
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            const cursor = request.result
            if (!cursor) { resolve(); return }
            transaction.objectStore(name).delete(cursor.primaryKey)
            cursor.continue()
          }
        })
      }
      store.put(trainingTombstone(meta, now))
      return true
    })
  }

  async listSurveyCognitiveDrafts(legacySessionIds: string[], after?: string | null) {
    const legacy = new Set(legacySessionIds)
    return this.run<SurveyCognitiveDraftPage>([META_STORE], 'readonly', transaction => new Promise((resolve, reject) => {
      // Metadata can include a large sealed FINAL. Read at most one cursor page,
      // never getAll() every product's payloads just to discover Survey IDs.
      const request = transaction.objectStore(META_STORE).openCursor(after ? IDBKeyRange.lowerBound(after, true) : undefined)
      const sessionIds: string[] = []
      let visited = 0
      request.onerror = () => reject(request.error || new Error('Survey draft cursor failed'))
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) { resolve({ sessionIds, nextCursor: null }); return }
        const meta = cursor.value as FinalDraftMeta
        if (isCognitiveDraft(meta) && (hasSurveyRetention(meta) || legacy.has(meta.attemptId))) sessionIds.push(meta.attemptId)
        if (++visited >= SURVEY_SCAN_LIMIT) { resolve({ sessionIds, nextCursor: String(cursor.key) }); return }
        cursor.continue()
      }
    }))
  }

  async expireSurveyCognitiveDraft(sessionId: string, legacySurvey: boolean, now: number) {
    const draftKey = `cognitive:${sessionId}`
    return this.run<boolean>([META_STORE, ANSWER_STORE, TRIAL_STORE], 'readwrite', async transaction => {
      const store = transaction.objectStore(META_STORE)
      const meta = await requestResult<FinalDraftMeta | undefined>(store.get(draftKey))
      if (!meta) return false
      const action = surveyExpiry(meta, legacySurvey, now)
      if (action === 'migrate') store.put({ ...meta, surveyRetention: { schemaVersion: 1, lastWriteAt: now } })
      if (action !== 'delete') return false
      // Writers and FINAL sealing use the same stores/transaction scope. A write
      // that won the race is re-read above; no stale read-then-delete window.
      const answers = await requestResult<FinalDraftAnswer[]>(transaction.objectStore(ANSWER_STORE).index(DRAFT_INDEX).getAll(draftKey))
      const trials = await requestResult<FinalDraftTrial[]>(transaction.objectStore(TRIAL_STORE).index(DRAFT_INDEX).getAll(draftKey))
      for (const answer of answers) transaction.objectStore(ANSWER_STORE).delete([draftKey, answer.itemKey])
      for (const trial of trials) transaction.objectStore(TRIAL_STORE).delete([draftKey, trial.trialIndex])
      store.delete(draftKey)
      return true
    })
  }

  async reopenRejectedForm(draftKey: string, rejection: RejectedFormSubmission) {
    return this.run<FinalDraftMeta | null>([META_STORE], 'readwrite', async transaction => {
      const store = transaction.objectStore(META_STORE)
      const current = await requestResult<FinalDraftMeta | undefined>(store.get(draftKey))
      if (!current) return null
      const next = reopenRejectedForm(current, rejection)
      store.put(next)
      return next
    })
  }

  async ensure(meta: FinalDraftMeta) {
    return this.run<FinalDraftMeta>([META_STORE], 'readwrite', async (transaction) => {
      const store = transaction.objectStore(META_STORE)
      const existing = await requestResult<FinalDraftMeta | undefined>(store.get(meta.draftKey))
      if (existing) assertNotExpired(existing)
      if (existing && !sameIdentity(existing, meta)) throw new FinalDraftIdentityConflictError(existing)
      if (existing) {
        if (hasSurveyRetention(meta) && existing.surveyRetention === undefined && existing.status === 'DRAFT' && !existing.sealedSubmission) {
          const migrated = stampRetentionWrite({ ...existing, surveyRetention: meta.surveyRetention })
          store.put(migrated)
          return migrated
        }
        return existing
      }
      const next = stampRetentionWrite(cloneValue(meta))
      store.put(next)
      return next
    })
  }

  async update(meta: FinalDraftMeta) {
    return this.run<FinalDraftMeta>([META_STORE], 'readwrite', async (transaction) => {
      const store = transaction.objectStore(META_STORE)
      const existing = await requestResult<FinalDraftMeta | undefined>(store.get(meta.draftKey))
      if (existing) assertNotExpired(existing)
      if (existing && !sameIdentity(existing, meta)) throw new FinalDraftIdentityConflictError(existing)
      if (existing) assertWritable(existing)
      const candidate = withExistingRetention(cloneValue(meta), existing)
      const next = stampChangedRetentionWrite(existing, candidate)
      store.put(next)
      return next
    })
  }

  async setInstrumentMetadata(draftKey: string, metadata: Record<string, unknown>) {
    return this.run<FinalDraftMeta | null>([META_STORE], 'readwrite', async (transaction) => {
      const store = transaction.objectStore(META_STORE)
      const current = await requestResult<FinalDraftMeta | undefined>(store.get(draftKey))
      if (!current) return null
      assertWritable(current)
      const next = {
        ...current,
        instrumentMetadata: { ...(current.instrumentMetadata ?? {}), ...cloneValue(metadata) },
        updatedAt: Date.now(),
      }
      const written = stampChangedRetentionWrite(current, next)
      store.put(written)
      return written
    })
  }

  async putAnswer(answer: FinalDraftAnswer, metadata?: Record<string, unknown>) {
    await this.run<void>([META_STORE, ANSWER_STORE], 'readwrite', async (transaction) => {
      const meta = await requestResult<FinalDraftMeta | undefined>(transaction.objectStore(META_STORE).get(answer.draftKey))
      if (!meta) throw new FinalDraftStorageError('本地测评草稿不存在')
      assertWritable(meta)
      const store = transaction.objectStore(ANSWER_STORE)
      const previous = (hasSurveyRetention(meta) || hasTrainingRetention(meta))
        ? await requestResult<FinalDraftAnswer | undefined>(store.get([answer.draftKey, answer.itemKey])) : undefined
      store.put(cloneValue(answer))
      const withMetadata = metadata ? { ...meta,
        instrumentMetadata: { ...(meta.instrumentMetadata ?? {}), ...cloneValue(metadata) }, updatedAt: Date.now() } : meta
      const nextMeta = (hasSurveyRetention(meta) || hasTrainingRetention(meta)) && (!previous || serialize(previous.value) !== serialize(answer.value))
        ? stampRetentionWrite(withMetadata) : stampChangedRetentionWrite(meta, withMetadata)
      if (nextMeta !== meta) transaction.objectStore(META_STORE).put(nextMeta)
    })
  }

  async replaceAnswers(expected: FinalDraftMeta, answers: FinalDraftAnswer[], metadata?: Record<string, unknown>) {
    const replacement = prepareAnswerReplacement(expected, answers, metadata)
    await this.run<void>([META_STORE, ANSWER_STORE], 'readwrite', async transaction => {
      const metaStore = transaction.objectStore(META_STORE)
      const current = await requestResult<FinalDraftMeta | undefined>(metaStore.get(replacement.expected.draftKey))
      if (!current) throw new FinalDraftStorageError('本地测评草稿不存在')
      // Re-read the full frozen identity and seal inside the same write
      // transaction, so another tab cannot seal a partially restored answer set.
      assertReplacementIdentity(current, replacement.expected)
      const store = transaction.objectStore(ANSWER_STORE)
      const keys = await requestResult<IDBValidKey[]>(store.index(DRAFT_INDEX).getAllKeys(current.draftKey))
      for (const key of keys) store.delete(key)
      for (const answer of replacement.answers) store.put(answer)
      metaStore.put(replacementMeta(current, replacement.metadata))
      // run() resolves only on transaction commit; failure aborts answers AND timing.
    })
  }

  async replaceSituationalAnswers(expected: FinalDraftMeta, answers: FinalDraftAnswer[]) {
    if (expected.instrument !== 'situational') throw new FinalDraftStorageError('只有情境草稿支持情境答案恢复')
    await this.replaceAnswers(expected, answers)
  }

  async listAnswers(draftKey: string) {
    return this.run<FinalDraftAnswer[]>([ANSWER_STORE], 'readonly', async (transaction) => (
      sortedAnswers(await requestResult<FinalDraftAnswer[]>(transaction.objectStore(ANSWER_STORE).index(DRAFT_INDEX).getAll(draftKey)))
    ))
  }

  async deleteAnswers(draftKey: string, itemKeys: string[]) {
    await this.run<void>([META_STORE, ANSWER_STORE], 'readwrite', async (transaction) => {
      const meta = await requestResult<FinalDraftMeta | undefined>(transaction.objectStore(META_STORE).get(draftKey))
      if (!meta) throw new FinalDraftStorageError('本地测评草稿不存在')
      assertWritable(meta)
      const store = transaction.objectStore(ANSWER_STORE)
      let changed = false
      for (const itemKey of new Set(itemKeys)) {
        const key = [draftKey, itemKey]
        if (!hasSurveyRetention(meta) && !hasTrainingRetention(meta)) store.delete(key)
        else if (await requestResult<FinalDraftAnswer | undefined>(store.get(key))) { store.delete(key); changed = true }
      }
      if (changed) transaction.objectStore(META_STORE).put(stampRetentionWrite(meta))
    })
  }

  async putTrial(trial: FinalDraftTrial, expected?: FinalDraftWriteIdentity) {
    await this.run<void>([META_STORE, TRIAL_STORE], 'readwrite', async (transaction) => {
      const meta = await requestResult<FinalDraftMeta | undefined>(transaction.objectStore(META_STORE).get(trial.draftKey))
      if (!meta) throw new FinalDraftStorageError('本地测评草稿不存在')
      assertFinalDraftWriteIdentity(meta,expected)
      assertWritable(meta)
      const store = transaction.objectStore(TRIAL_STORE)
      const key: [string, number] = [trial.draftKey, trial.trialIndex]
      const existing = await requestResult<FinalDraftTrial | undefined>(store.get(key))
      if (existing && serialize(existing.payload) !== serialize(trial.payload)) throw new FinalDraftTrialConflictError(trial.trialIndex)
      if (!existing) {
        store.put(cloneValue(trial))
        if (hasSurveyRetention(meta) || hasTrainingRetention(meta)) transaction.objectStore(META_STORE).put(stampRetentionWrite(meta))
      }
    })
  }

  async listTrials(draftKey: string) {
    return this.run<FinalDraftTrial[]>([TRIAL_STORE], 'readonly', async (transaction) => (
      sortedTrials(await requestResult<FinalDraftTrial[]>(transaction.objectStore(TRIAL_STORE).index(DRAFT_INDEX).getAll(draftKey)))
    ))
  }

  async setStatus(draftKey: string, status: FinalDraftStatus, error?: { code?: string | null; message?: string | null }, expected?: FinalDraftWriteIdentity) {
    return this.run<FinalDraftMeta | null>([META_STORE], 'readwrite', async (transaction) => {
      const store = transaction.objectStore(META_STORE)
      const current = await requestResult<FinalDraftMeta | undefined>(store.get(draftKey))
      if (!current) return null
      assertFinalDraftWriteIdentity(current,expected)
      assertStatusTransition(current, status)
      const next = { ...current, status, updatedAt: Date.now(), errorCode: error?.code ?? null, errorMessage: error?.message ?? null }
      const written = stampChangedRetentionWrite(current, next)
      store.put(written)
      return written
    })
  }

  async snapshot(draftKey: string) {
    return this.run<FinalDraftSnapshot | null>([META_STORE, ANSWER_STORE, TRIAL_STORE], 'readonly', async (transaction) => {
      const meta = await requestResult<FinalDraftMeta | undefined>(transaction.objectStore(META_STORE).get(draftKey))
      if (!meta) return null
      const answers = sortedAnswers(await requestResult<FinalDraftAnswer[]>(transaction.objectStore(ANSWER_STORE).index(DRAFT_INDEX).getAll(draftKey)))
      const trials = sortedTrials(await requestResult<FinalDraftTrial[]>(transaction.objectStore(TRIAL_STORE).index(DRAFT_INDEX).getAll(draftKey)))
      return { meta, answers, trials }
    })
  }

  async sealForSubmission<T>(draftKey: string, buildPayload: (snapshot: FinalDraftSnapshot) => T, expected?: FinalDraftWriteIdentity) {
    return this.run<FinalDraftSealResult<T> | null>([META_STORE, ANSWER_STORE, TRIAL_STORE], 'readwrite', async (transaction) => {
      const metaStore = transaction.objectStore(META_STORE)
      const current = await requestResult<FinalDraftMeta | undefined>(metaStore.get(draftKey))
      if (!current) return null
      assertFinalDraftWriteIdentity(current,expected)
      assertNotExpired(current)
      if (current.sealedSubmission) {
        return { meta: current, payload: cloneValue(current.sealedSubmission.payload as T) }
      }
      if (current.status !== 'DRAFT') throw new FinalDraftPendingWithoutSealError(current.status)
      const answers = sortedAnswers(await requestResult<FinalDraftAnswer[]>(transaction.objectStore(ANSWER_STORE).index(DRAFT_INDEX).getAll(draftKey)))
      const trials = sortedTrials(await requestResult<FinalDraftTrial[]>(transaction.objectStore(TRIAL_STORE).index(DRAFT_INDEX).getAll(draftKey)))
      const payload = cloneValue(buildPayload({ meta: current, answers, trials }))
      const sealedAt = Date.now()
      const next: FinalDraftMeta = {
        ...current,
        status: 'SUBMITTING',
        updatedAt: sealedAt,
        errorCode: null,
        errorMessage: null,
        sealedSubmission: { schemaVersion: 1, sealedAt, payload: cloneValue(payload) },
      }
      metaStore.put(next)
      return { meta: next, payload }
    })
  }

  async mutateCognitiveArchive(draftKey:string,identity:CognitiveArchiveIdentity,mutation:CognitiveArchiveMutation) {
    return this.run<FinalDraftMeta>([META_STORE],'readwrite',async transaction=>{
      const store=transaction.objectStore(META_STORE),current=await requestResult<FinalDraftMeta|undefined>(store.get(draftKey))
      if(!current)throw new FinalDraftStorageError('本地认知原件不存在')
      assertNotExpired(current)
      const next=mutateCognitiveRawArchive(current,identity,mutation)
      store.put(next);return next
    })
  }

  async delete(draftKey: string, expected?: FinalDraftWriteIdentity) {
    await this.run<void>([META_STORE, ANSWER_STORE, TRIAL_STORE], 'readwrite', async (transaction) => {
      const meta = await requestResult<FinalDraftMeta | undefined>(transaction.objectStore(META_STORE).get(draftKey))
      if(meta)assertFinalDraftWriteIdentity(meta,expected)
      if (meta?.trainingRetention?.expiredAt !== undefined || (meta?.cognitiveRawArchive && !meta.cognitiveRawArchive.archiveConfirmed)) return
      transaction.objectStore(META_STORE).delete(draftKey)
      // The index returns primary keys, not draftKey index values. Avoid cloning
      // potentially large answer/trial payloads solely to discard accepted drafts.
      for (const name of [ANSWER_STORE, TRIAL_STORE]) {
        const store = transaction.objectStore(name)
        const keys = await requestResult<IDBValidKey[]>(store.index(DRAFT_INDEX).getAllKeys(draftKey))
        for (const key of keys) store.delete(key)
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
