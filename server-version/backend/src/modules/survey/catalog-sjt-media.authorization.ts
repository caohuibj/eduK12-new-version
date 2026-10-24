import { Prisma } from '@prisma/client'
import { canonicalHash } from '../assessment-runtime/canonical'
import { assertAssessmentAssetReferencesReady, AssessmentAssetValidationError } from '../assessment-media/assessment-asset'
import { lockStoredAssetRows } from '../../services/assetStorage'
import { SjtAuthorMediaError, SJT_AUTHOR_MEDIA_SCOPE, SJT_AUTHOR_MAX_IMAGE_BYTES, SJT_AUTHOR_RELEASE_MEDIA_REFERENCE_TYPE, sjtAuthorImages } from '../situational/authoring/media'
import { catalogSnapshotsForDrafts } from './catalog.service'
import type { LibraryBoundMediaUnit } from '../scale-library-governance/media.authorization'
import { CatalogSourceError, ONLINE_SJT_ADAPTER_VERSION, type CatalogSourceRef } from './catalog.sources'

const fail = (): never => { throw new CatalogSourceError('SOURCE_SJT_MEDIA_AUTHORIZATION_REQUIRED', 403) }
/** Publication-time proof only. Source and grant locks are acquired by the existing
 * catalog admission function. Participant reads use the frozen publication instead.
 * A malformed sourced unit must never fall back to native asset ownership. */
export async function authorizedCatalogSjtMedia(tx: Prisma.TransactionClient, userId: string, unit: LibraryBoundMediaUnit) {
  if (unit.kind !== 'SJT' || !unit.sourceProvenance) return null
  const source = unit.sourceProvenance.source as CatalogSourceRef | undefined
  if (!source || source.kind !== 'SJT' || typeof source.sourceId !== 'string' || typeof source.sourceVersion !== 'string') return fail()
  let images: ReturnType<typeof sjtAuthorImages>
  try { images = sjtAuthorImages({ templateVersion: 'sjt-online-v1', display: unit.definition }) }
  catch (error) { if (error instanceof SjtAuthorMediaError) return fail(); throw error }
  if (!images.length) return []
  if (source.sourceId.startsWith('registry:') || unit.sourceProvenance.adapterVersion !== ONLINE_SJT_ADAPTER_VERSION || !unit.compiledDefinition) return fail()
  const candidates = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM survey_tool_grants
    WHERE user_id=${userId} AND status='ACTIVE' AND snapshot->'ref'=${JSON.stringify(source)}::jsonb ORDER BY id`
  const snapshots = await catalogSnapshotsForDrafts(tx, userId, candidates.map(row => row.id))
  const bound = [...snapshots.values()].some(snapshot => canonicalHash(snapshot.displayDefinition) === canonicalHash(unit.definition)
    && canonicalHash(snapshot.compiledDefinition) === canonicalHash(unit.compiledDefinition)
    && canonicalHash({ ...snapshot.provenance, originalSource: snapshot.provenance.source ?? null, source: snapshot.ref,
      definitionDigest: snapshot.definitionDigest, adapterVersion: snapshot.adapterVersion }) === canonicalHash(unit.sourceProvenance))
  if (!bound) return fail()
  const release = await tx.sjtAuthorRelease.findUnique({ where: { id: source.sourceId }, select: {
    status: true, authorizationPolicy: true, instrumentVersion: true, definitionHash: true,
  } })
  // Course-scoped permissions are not interchangeable with a Survey tool grant.
  if (!release || release.status !== 'PUBLISHED' || release.authorizationPolicy !== null
    || release.instrumentVersion !== source.sourceVersion || release.definitionHash !== unit.sourceProvenance.definitionHash) return fail()
  const ids = [...new Set(images.map(image => image.asset.assetId))].sort()
  if (ids.length > 20) return fail()
  await lockStoredAssetRows(tx, ids)
  const retained = await tx.assetReference.findMany({ where: { assetId: { in: ids }, entityType: SJT_AUTHOR_RELEASE_MEDIA_REFERENCE_TYPE,
    entityId: source.sourceId, field: 'media' }, select: { assetId: true } })
  if (ids.some(id => !retained.some(ref => ref.assetId === id))) return fail()
  const assets = await tx.storedAsset.findMany({ where: { id: { in: ids } }, select: {
    id: true, accessScope: true, scopeId: true, sizeBytes: true, deletedAt: true,
  } })
  if (ids.some(id => { const asset = assets.find(row => row.id === id); return !asset || asset.deletedAt
    || asset.accessScope !== 'PRIVATE' || asset.scopeId !== SJT_AUTHOR_MEDIA_SCOPE || asset.sizeBytes <= 0 || asset.sizeBytes > SJT_AUTHOR_MAX_IMAGE_BYTES })) return fail()
  const refs = images.map(image => image.asset)
  try { await assertAssessmentAssetReferencesReady(refs, tx) }
  catch (error) { if (error instanceof AssessmentAssetValidationError) return fail(); throw error }
  return refs
}
