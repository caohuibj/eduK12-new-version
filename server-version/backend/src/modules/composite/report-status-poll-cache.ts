/**
 * Process-local LRU for participant composite report-status polling.
 *
 * Not Redis, and not the encrypted report body cache. Keyed by attemptId
 * only: this endpoint's status payload is not a per-user projection.
 * Each entry carries its owner's identity, so a poll can be authorized
 * in memory before any database read: on a cache hit with a matching
 * owner the status is returned with ZERO database queries. Only a cache
 * miss (or an owner mismatch) falls back to the database, where one
 * header read serves both the auth check and the status snapshot.
 * The teacher status path must not use this cache; its payload must not
 * include participantFeedback.
 *
 * PENDING and PROCESSING live for 5000ms — longer than the frontend's
 * ~400ms minimum poll interval and the harness's ~2000ms interval, so
 * repeated polls during report generation hit the cache instead of the
 * database. (At 2000ms the TTL expired right when the next ~2s poll
 * arrived, so most polls missed; 5000ms covers two full poll gaps.)
 * READY lives for 60s. FAILED, WAITING, and every other state
 * are not stored, and are never stored as READY.
 *
 * The Report Worker actively invalidates an entry when it commits a READY
 * report in the same process, so READY is visible with zero delay there;
 * across processes the PENDING TTL bounds staleness instead.
 */

const MAX_ENTRIES = 256
const PENDING_TTL_MS = 5000
const READY_TTL_MS = 60_000

export const REPORT_STATUS_POLL_CACHE_CAP = MAX_ENTRIES
export const REPORT_STATUS_POLL_PENDING_TTL_MS = PENDING_TTL_MS
export const REPORT_STATUS_POLL_READY_TTL_MS = READY_TTL_MS

type CacheableState = 'PENDING' | 'PROCESSING' | 'READY'

/** Identity needed to authorize a cached poll in memory, without a DB read. */
export type ReportStatusPollCacheOwner = {
  userId: string | null
  recoveryTokenHash: string | null
}

/** Minimal parent identity returned with a cache hit (callers only use .status). */
export type ReportStatusPollCacheParent = {
  id: string
  userId: string | null
  recoveryTokenHash: string | null
  attemptEpoch: number
  asyncReportEpoch: number
  compositeAssessment: { id: string; productKind: string | null }
}

type CacheEntry = {
  expiresAt: number
  /** State that selected the TTL. Never FAILED, WAITING, or anything else. */
  state: CacheableState
  value: unknown
  owner: ReportStatusPollCacheOwner
  parent: ReportStatusPollCacheParent
}

const entries = new Map<string, CacheEntry>()

type NowSource = () => number
let nowSource: NowSource = Date.now

/**
 * Pin the cache clock for TTL tests. Pass a millisecond timestamp, a clock
 * function, or null to restore Date.now.
 */
export function setReportStatusPollCacheNowForTest(now: number | NowSource | null): void {
  if (now === null) {
    nowSource = Date.now
    return
  }
  if (typeof now === 'number') {
    const fixed = now
    nowSource = () => fixed
    return
  }
  nowSource = now
}

/** Drop every entry and restore the real clock. */
export function clearReportStatusPollCacheForTest(): void {
  entries.clear()
  nowSource = Date.now
}

const currentTimeMs = () => nowSource()

const cloneUnknown = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return new Date(value.getTime())
  if (Array.isArray(value)) return value.map(cloneUnknown)
  const source = value as Record<string, unknown>
  const copy: Record<string, unknown> = {}
  for (const key of Object.keys(source)) copy[key] = cloneUnknown(source[key])
  return copy
}

const cloneValue = <T>(value: T): T => cloneUnknown(value) as T

const cacheableState = (state: string): CacheableState | null => {
  if (state === 'PENDING' || state === 'PROCESSING' || state === 'READY') return state
  return null
}

const ttlForState = (state: CacheableState): number =>
  state === 'READY' ? READY_TTL_MS : PENDING_TTL_MS

/** Report-status state, not the attempt status field (COMPLETED / IN_PROGRESS). */
const payloadReportState = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || !('reportStatus' in value)) return null
  const reportStatus = (value as { reportStatus?: { state?: unknown } }).reportStatus
  if (!reportStatus || typeof reportStatus !== 'object') return null
  return typeof reportStatus.state === 'string' ? reportStatus.state : null
}

const evictOverflow = () => {
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value
    if (oldest === undefined) break
    entries.delete(oldest)
  }
}

/**
 * Full cached entry (payload + owner + parent identity), or null on miss / expiry.
 * The caller authorizes the entry in memory via isReportStatusPollCacheOwner.
 */
export function readReportStatusPollCacheEntry<T>(attemptId: string): {
  value: T
  owner: ReportStatusPollCacheOwner
  parent: ReportStatusPollCacheParent
} | null {
  const entry = entries.get(attemptId)
  if (!entry) return null
  if (entry.expiresAt <= currentTimeMs()) {
    entries.delete(attemptId)
    return null
  }
  // Map order is insertion order; reinsert so this key is most recently used.
  entries.delete(attemptId)
  entries.set(attemptId, entry)
  return { value: cloneValue(entry.value) as T, owner: { ...entry.owner }, parent: cloneValue(entry.parent) }
}

/**
 * Clone of the cached payload, or null on miss / expiry.
 * Prefer readReportStatusPollCacheEntry when the caller also needs the owner.
 */
export function readReportStatusPollCache<T>(attemptId: string): T | null {
  return readReportStatusPollCacheEntry<T>(attemptId)?.value ?? null
}

/**
 * In-memory ownership check for a cached entry. Mirrors
 * authorizeReportParticipant's ownership rule (without the composite-support
 * check, which already passed when the entry was written). A non-owner must
 * never be served a cached payload; they fall back to the DB auth check.
 */
export function isReportStatusPollCacheOwner(
  owner: ReportStatusPollCacheOwner,
  context: { userId?: string; recoveryTokenHash?: string },
): boolean {
  return context.userId
    ? owner.userId === context.userId
    : Boolean(context.recoveryTokenHash && owner.userId === null && owner.recoveryTokenHash === context.recoveryTokenHash)
}

/** Drop one attempt's cached poll entry, e.g. when its report becomes READY. */
export function invalidateReportStatusPollCache(attemptId: string): void {
  entries.delete(attemptId)
}

/**
 * Store a clone of a participant report-status payload.
 *
 * `state` is the computed report status (`reportStatus.state`). Only PENDING,
 * PROCESSING, and READY are stored. FAILED, WAITING, and any other state are
 * dropped, including any previous entry, so they cannot be served later as READY.
 * A payload whose own report status disagrees with `state` is not stored.
 * `parent` supplies the owner + minimal parent identity stored with the entry.
 */
export function writeReportStatusPollCache<T>(attemptId: string, value: T, state: string, parent: ReportStatusPollCacheParent): void {
  const cacheable = cacheableState(state)
  const ownStatus = payloadReportState(value)
  if (!cacheable || (ownStatus !== null && (ownStatus !== state || !cacheableState(ownStatus)))) {
    entries.delete(attemptId)
    return
  }

  entries.delete(attemptId)
  entries.set(attemptId, {
    expiresAt: currentTimeMs() + ttlForState(cacheable),
    state: cacheable,
    value: cloneValue(value),
    owner: { userId: parent.userId, recoveryTokenHash: parent.recoveryTokenHash },
    parent: cloneValue(parent),
  })
  evictOverflow()
}
