import { Prisma } from '@prisma/client'
import { getContentReleaseBatch, type StoredRelease } from '../measurement-content/repository'
import { loadLegacyScaleArtifactMap, type LegacyScaleArtifactRow } from './training-legacy-scale-artifacts'
import { trainingContentSnapshotSchema } from './training-content-binding'
import { ContentReleaseError } from '../measurement-content/release'
import { publicationReadKey, startReadsCache, startCompositeCache } from './start-read-cache'

type RawClient = { $queryRaw: Prisma.TransactionClient['$queryRaw'] }

/** Request-local START reads hoisted out of the interactive transaction.
 * Keyed to one composite publication identity; a hash/version change must
 * discard the bag and fall back to in-tx loads. In-tx rechecks remain
 * authoritative (release id+hash+status, composite status/hash/updatedAt). */
export type PrefetchedStartReads = {
  compositeId: string
  snapshotHash: string | null
  releases: Map<string, StoredRelease>
  legacyArtifacts: Map<string, LegacyScaleArtifactRow>
}

export const asPreloadedComposite = <T extends object>(composite: T): T & { _preloaded: true } =>
  ({ ...composite, _preloaded: true as const })

export function snapshotMeasurementReleaseIds(snapshot: unknown): string[] {
  const parsed = trainingContentSnapshotSchema.safeParse(snapshot)
  if (!parsed.success) return []
  return [...new Set(parsed.data.units
    .filter(unit => !unit.source.standardCombination && unit.source.kind !== 'STATIC_SJT_REGISTRY')
    .map(unit => unit.measurement.releaseId)
    .filter(Boolean))]
}

const cloneStartReads=(bag:PrefetchedStartReads):PrefetchedStartReads=>({
  compositeId:bag.compositeId,
  snapshotHash:bag.snapshotHash,
  releases:new Map(bag.releases),
  legacyArtifacts:new Map(bag.legacyArtifacts),
})

export async function prefetchStartReads(db: RawClient, composite: { id: string; trainingContentSnapshot?: unknown; trainingContentSnapshotHash?: string | null; updatedAt?: Date | string | null }): Promise<PrefetchedStartReads> {
  const snapshotHash = composite.trainingContentSnapshotHash ?? null
  const key = publicationReadKey(composite.id, snapshotHash, composite.updatedAt ?? null)
  const cached = startReadsCache.get(key) as PrefetchedStartReads | undefined
  if (cached && cached.compositeId === composite.id && cached.snapshotHash === snapshotHash) return cloneStartReads(cached)
  const releaseIds = snapshotMeasurementReleaseIds(composite.trainingContentSnapshot)
  const releases = releaseIds.length
    ? await getContentReleaseBatch(db as Prisma.TransactionClient, releaseIds, false)
    : new Map<string, StoredRelease>()
  const legacyArtifacts = snapshotHash
    ? await loadLegacyScaleArtifactMap(db, composite.id, snapshotHash)
    : new Map<string, LegacyScaleArtifactRow>()
  const bag = { compositeId: composite.id, snapshotHash, releases, legacyArtifacts }
  startReadsCache.set(key, cloneStartReads(bag))
  return bag
}

export async function preloadStartComposite<T extends { id: string; trainingContentSnapshot?: unknown; trainingContentSnapshotHash?: string | null }>(db: RawClient, composite: T): Promise<T & { _preloaded: true; _startReads: PrefetchedStartReads }> {
  const marked = asPreloadedComposite(composite)
  const startReads = await prefetchStartReads(db, marked)
  return Object.assign(marked, { _startReads: startReads })
}

/** Cheap exact-id recheck. A REVOKED or hash-changed release, or a missing
 * row, rejects the hoisted bag so START cannot admit a stale publication. */
export async function recheckPrefetchedReleases(tx: RawClient, releases: Map<string, StoredRelease>): Promise<void> {
  if (!releases.size) return
  const ids = [...releases.keys()]
  const rows = await tx.$queryRaw<Array<{ id: string; content_hash: string; status: string }>>(Prisma.sql`
    SELECT id, content_hash, status FROM measurement_content_releases
    WHERE id IN (${Prisma.join(ids)})`)
  const byId = new Map(rows.map(row => [row.id, row]))
  for (const [id, expected] of releases) {
    const row = byId.get(id)
    if (!row || row.content_hash !== expected.contentHash || row.status === 'REVOKED') {
      const err = new ContentReleaseError('CONTENT_TRAINING_BINDING_INVALID') as ContentReleaseError & { statusCode: number }
      err.statusCode = 409
      throw err
    }
  }
}

export function startReadsIfCurrent(composite: { id: string; trainingContentSnapshotHash?: string | null; _startReads?: PrefetchedStartReads }): PrefetchedStartReads | undefined {
  const bag = composite._startReads
  if (!bag || bag.compositeId !== composite.id || bag.snapshotHash !== (composite.trainingContentSnapshotHash ?? null)) return undefined
  return bag
}
