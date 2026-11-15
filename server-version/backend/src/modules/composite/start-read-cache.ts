/** Process-local bounded TTL cache for hoisted START publication reads.
 * Keys are immutable publication identities (id + snapshot hash / updatedAt),
 * so a newly published version misses and is loaded fresh. The in-tx
 * status/hash/revocation rechecks in createAttempt remain authoritative;
 * a stale entry cannot admit a wrong start. Not Redis, not cross-process. */

export const START_READ_CACHE_TTL_MS = 120_000
export const START_READ_CACHE_MAX_ENTRIES = 256
// availableTemplateCache keys are NOT publication-versioned: keep its TTL at the
// original 30s budget so newly published/archived questionnaires surface in the
// /available listing within the same visibility window as before (PR #730 review).
export const AVAILABLE_TEMPLATE_CACHE_TTL_MS = 30_000

export class BoundedTtlCache<V> {
  private readonly map = new Map<string, { value: V; expiresAt: number }>()
  private readonly inFlight = new Map<string, Promise<V>>()

  singleFlight(key: string, load: () => Promise<V>): Promise<V> {
    const pending = this.inFlight.get(key)
    if (pending) return pending
    if (this.inFlight.size >= 32) return load()
    const task = load().finally(() => { if (this.inFlight.get(key) === task) this.inFlight.delete(key) })
    this.inFlight.set(key, task)
    return task
  }

  constructor(private readonly ttlMs: number, private readonly maxEntries: number) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key)
    if (!hit) return undefined
    if (hit.expiresAt <= Date.now()) {
      this.map.delete(key)
      return undefined
    }
    this.map.delete(key)
    this.map.set(key, hit)
    return hit.value
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs })
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value
      if (oldest === undefined) break
      this.map.delete(oldest)
    }
  }

  get size() { return this.map.size }
  clear() { this.map.clear() }
}

export const startReadsCache = new BoundedTtlCache<unknown>(START_READ_CACHE_TTL_MS, START_READ_CACHE_MAX_ENTRIES)
export const startCompositeCache = new BoundedTtlCache<unknown>(START_READ_CACHE_TTL_MS, START_READ_CACHE_MAX_ENTRIES)

// START scalar metadata (classification + eligibility fields). TTL is ZERO:
// the cache is used purely as a single-flight deduper for CONCURRENT retry
// bursts of a rejection storm (every in-flight VU reads the same publication
// scalars — one query per concurrent wave instead of one per attempt), with
// zero staleness: a fresh attempt always reads live publication state, so
// archive/republish/eligibility semantics are byte-identical to the uncached
// path. The in-tx admission lock, publication re-read and course-student
// re-check in createAttempt remain authoritative race guards.
export const START_METADATA_CACHE_TTL_MS = 0
export const startMetadataCache = new BoundedTtlCache<unknown>(START_METADATA_CACHE_TTL_MS, START_READ_CACHE_MAX_ENTRIES)

export const availableTemplateCache = new BoundedTtlCache<unknown>(AVAILABLE_TEMPLATE_CACHE_TTL_MS, 8)

export const publicationReadKey = (id: string, snapshotHash: string | null | undefined, updatedAt?: Date | string | null) => {
  const stamp = updatedAt instanceof Date ? String(updatedAt.getTime()) : updatedAt ? String(new Date(updatedAt).getTime()) : ''
  return `${id}:${snapshotHash ?? ''}:${stamp}`
}

export const resetStartReadCachesForTests = () => {
  availableTemplateCache.clear()
  startMetadataCache.clear()
  startReadsCache.clear()
  startCompositeCache.clear()
}
