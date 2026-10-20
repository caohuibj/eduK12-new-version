import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { canonicalHash, canonicalJsonString } from '../assessment-runtime/canonical'
import { assertMeasurementDependency, assertReleaseTransition, ContentReleaseError, prepareRelease, type PreparedRelease, type ReleaseStatus } from './release'

type Db = Prisma.TransactionClient
export type StoredRelease = PreparedRelease & { releaseId: string; status: ReleaseStatus; publishedBy: string; publishedAt: Date }
type Row = {
  id: string; layer: PreparedRelease['layer']; family: PreparedRelease['family']; content_key: string; version: string;
  hash_scheme: PreparedRelease['hashScheme']; content_hash: string; content: PreparedRelease['content'];
  provenance: Record<string, unknown>;
  scope: PreparedRelease['scope']; asset_refs: PreparedRelease['assetRefs']; source_release_id: string | null;
  published_by: string; published_at: Date; status: ReleaseStatus;
}
const decode = (r: Row): StoredRelease => ({
  ...prepareRelease({ layer: r.layer, family: r.family, key: r.content_key, version: r.version, content: r.content,
    scope: r.scope, provenance: r.provenance, assetRefs: r.asset_refs, sourceReleaseId: r.source_release_id }),
  hashScheme: r.hash_scheme, contentHash: r.content_hash, releaseId: r.id, status: r.status,
  publishedBy: r.published_by, publishedAt: r.published_at,
})
export async function getContentRelease(db: Db, releaseId: string, lockForPublication = false): Promise<StoredRelease | null> {
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM measurement_content_releases WHERE id=${releaseId} ${lockForPublication ? Prisma.sql`FOR SHARE` : Prisma.empty}`)
  if (!rows[0]) return null
  const row = rows[0]
  const value = decode(row)
  if (prepareRelease(valueForInput(value)).contentHash !== row.content_hash || value.hashScheme !== 'MEASUREMENT_CONTENT_CANONICAL_V1') {
    throw new ContentReleaseError('CONTENT_RELEASE_HASH_MISMATCH')
  }
  return value
}
/** Admission/freezing resolves an existing exact identity and holds its state
 * lock through the caller's transaction. It never publishes a missing version. */
export async function requirePublishedContentRelease(db:Db,raw:unknown):Promise<StoredRelease>{
  const expected=prepareRelease(raw)
  const rows=await db.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM measurement_content_releases
    WHERE family=${expected.family} AND layer=${expected.layer} AND content_key=${expected.key} AND version=${expected.version} FOR SHARE`)
  if(!rows[0])throw new ContentReleaseError('CONTENT_RELEASE_NOT_PUBLISHED')
  const release=decode(rows[0])
  if(release.status!=='PUBLISHED')throw new ContentReleaseError('CONTENT_RELEASE_NOT_AVAILABLE_FOR_ADMINISTRATION')
  if(release.hashScheme!==expected.hashScheme||release.contentHash!==expected.contentHash
    ||canonicalHash(valueForInput(release))!==canonicalHash(valueForInput(expected)))throw new ContentReleaseError('CONTENT_VERSION_IMMUTABLE')
  return release
}
const valueForInput = (r: PreparedRelease) => ({ layer:r.layer,family:r.family,key:r.key,version:r.version,content:r.content,scope:r.scope,provenance:r.provenance,assetRefs:r.assetRefs,sourceReleaseId:r.sourceReleaseId })

async function checkReferences(db: Db, input: PreparedRelease, purpose: 'NEW_ADMINISTRATION' | 'HISTORICAL_INTERPRETATION'): Promise<void> {
  const refs = input.layer === 'MEASUREMENT' ? [] : input.layer === 'REFERENCE' ? [input.content.measurement] : input.content.measurements
  for (const ref of refs) {
    const target = await getContentRelease(db, ref.releaseId, true)
    if (!target || target.layer !== 'MEASUREMENT' || target.family !== input.family || target.contentHash !== ref.contentHash) {
      throw new ContentReleaseError('CONTENT_MEASUREMENT_REFERENCE_MISMATCH')
    }
    assertMeasurementDependency(target.status, purpose)
    const keys = new Set(target.content.metrics.map(m => m.metricKey))
    const requested = input.layer === 'REFERENCE' ? input.content.entries.map(e => e.metricKey) : input.layer === 'REPORT' ? input.content.metricKeys : []
    if (requested.some(key => !keys.has(key))) throw new ContentReleaseError('CONTENT_UNKNOWN_METRIC')
  }
  if (input.sourceReleaseId) {
    const source = await getContentRelease(db, input.sourceReleaseId, true)
    if (!source || source.layer !== input.layer || source.family !== input.family) throw new ContentReleaseError('CONTENT_SOURCE_MISMATCH')
  }
}

/** Internal persistence boundary, not an authorization endpoint. Family callers must
 * validate definitions and current capability/resource/source rights in their transaction.
 * V05 binds those checks to the existing admin system. No anonymous route exposes this.
 */
export async function publishContentRelease(db: Db, raw: unknown, actorId: string, purpose: 'NEW_ADMINISTRATION' | 'HISTORICAL_INTERPRETATION' = 'NEW_ADMINISTRATION'): Promise<StoredRelease> {
  if (!actorId.trim()) throw new ContentReleaseError('CONTENT_ACTOR_REQUIRED')
  const input = prepareRelease(raw)
  const lockKey = canonicalHash([input.family,input.layer,input.key,input.version])
  await db.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`)
  const existing = await db.$queryRaw<Row[]>(Prisma.sql`SELECT * FROM measurement_content_releases
    WHERE family=${input.family} AND layer=${input.layer} AND content_key=${input.key} AND version=${input.version} FOR SHARE`)
  if (existing[0]) {
    const prior = decode(existing[0])
    if (canonicalHash(valueForInput(prior)) !== canonicalHash(valueForInput(input))) throw new ContentReleaseError('CONTENT_VERSION_IMMUTABLE')
    // Retrying publish does not reactivate a retired/revoked identity.
    return prior
  }
  await checkReferences(db, input, purpose)
  const id = randomUUID()
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`INSERT INTO measurement_content_releases
    (id,layer,family,content_key,version,hash_scheme,content_hash,content,scope,provenance,asset_refs,source_release_id,published_by)
    VALUES (${id},${input.layer},${input.family},${input.key},${input.version},${input.hashScheme},${input.contentHash},
      ${canonicalJsonString(input.content)}::jsonb,${canonicalJsonString(input.scope)}::jsonb,${canonicalJsonString(input.provenance)}::jsonb,
      ${canonicalJsonString(input.assetRefs)}::jsonb,${input.sourceReleaseId},${actorId}) RETURNING *`)
  return decode(rows[0])
}

/** Current capability checks belong in the same caller-owned transaction. */
export async function transitionContentRelease(db: Db, input: { releaseId: string; expectedStatus: ReleaseStatus; status: ReleaseStatus; actorId: string; reason: string }): Promise<void> {
  if (!input.actorId.trim() || !input.reason.trim()) throw new ContentReleaseError('CONTENT_TRANSITION_REASON_REQUIRED')
  assertReleaseTransition(input.expectedStatus,input.status)
  const changed = await db.$executeRaw(Prisma.sql`UPDATE measurement_content_releases SET status=${input.status}
    WHERE id=${input.releaseId} AND status=${input.expectedStatus}`)
  if (changed !== 1) throw new ContentReleaseError('CONTENT_STATUS_CONFLICT')
  await db.$executeRaw(Prisma.sql`INSERT INTO measurement_content_release_events
    (id,release_id,from_status,to_status,actor_id,reason)
    VALUES (${randomUUID()},${input.releaseId},${input.expectedStatus},${input.status},${input.actorId},${input.reason})`)
}

/** A catalog is an index over releases, never a second scientific definition.
 * Caller supplies only IDs already admitted by current resource authorization.
 */
export async function listContentCatalog(db: PrismaClient | Db, authorizedIds: string[], limit = 50): Promise<Array<{ releaseId: string; family: string; layer: string; key: string; version: string; contentHash: string; status: string }>> {
  if (!authorizedIds.length) return []
  if (authorizedIds.length > 1000 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new ContentReleaseError('CONTENT_CATALOG_BOUND_INVALID')
  return db.$queryRaw(Prisma.sql`SELECT id AS "releaseId",family,layer,content_key AS key,version,
    content_hash AS "contentHash",status FROM measurement_content_releases
    WHERE id IN (${Prisma.join(authorizedIds)}) ORDER BY published_at DESC,id LIMIT ${limit}`)
}
