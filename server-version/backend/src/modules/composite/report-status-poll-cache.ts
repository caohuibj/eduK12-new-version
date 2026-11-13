/**
 * Process-local LRU for participant composite report-status polling.
 *
 * Not Redis, and not the encrypted report body cache. Keyed by attemptId
 * only: this endpoint's status payload is not a per-user projection.
 * Callers authorize before every read or write. The teacher status path
 * must not use this cache; its payload must not include participantFeedback.
 *
 * PENDING and PROCESSING live for 300ms. READY lives for 60s. FAILED,
 * WAITING, and every other state are not stored, and are never stored as READY.
 */

const MAX_ENTRIES = 256
const PENDING_TTL_MS = 300
const READY_TTL_MS = 60_000

export const REPORT_STATUS_POLL_CACHE_CAP = MAX_ENTRIES
export const REPORT_STATUS_POLL_PENDING_TTL_MS = PENDING_TTL_MS
export const REPORT_STATUS_POLL_READY_TTL_MS = READY_TTL_MS

type CacheableState = 'PENDING' | 'PROCESSING' | 'READY'

type CacheEntry = {
  expiresAt: number
  /** State that selected the TTL. Never FAILED, WAITING, or anything else. */
  state: CacheableState
  value: unknown
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
 * Clone of the cached payload, or null on miss / expiry.
 * The caller must already have authorized this attempt.
 */
export function readReportStatusPollCache<T>(attemptId: string): T | null {
  const entry = entries.get(attemptId)
  if (!entry) return null
  if (entry.expiresAt <= currentTimeMs()) {
    entries.delete(attemptId)
    return null
  }
  // Map order is insertion order; reinsert so this key is most recently used.
  entries.delete(attemptId)
  entries.set(attemptId, entry)
  return cloneValue(entry.value) as T
}

/**
 * Store a clone of a participant report-status payload.
 *
 * `state` is the computed report status (`reportStatus.state`). Only PENDING,
 * PROCESSING, and READY are stored. FAILED, WAITING, and any other state are
 * dropped, including any previous entry, so they cannot be served later as READY.
 * A payload whose own report status disagrees with `state` is not stored.
 */
export function writeReportStatusPollCache<T>(attemptId: string, value: T, state: string): void {
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
  })
  evictOverflow()
}
