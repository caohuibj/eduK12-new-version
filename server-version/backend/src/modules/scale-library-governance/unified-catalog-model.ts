import type { UnifiedScaleLibraryEntry } from '../scale/library/catalog-only-read-model'
import type { LibraryProduct } from './contracts'
import type { entryView } from './service'

export type AuthoredCatalogEntry = ReturnType<typeof entryView>
/** A catalog identity is a discriminated pointer, never an authorization token. */
export type CatalogExactVersion =
  | { origin: 'STANDARD_REGISTRY'; instrumentKey: string; instrumentVersion: string }
  | { origin: 'AUTHORED'; entryId: string; releaseId: string; releaseVersion?: string; contentHash?: string }

type CatalogAvailability = { status: 'AVAILABLE' | 'RESTRICTED' | 'NOT_AVAILABLE'; reasons: string[] }
export interface StandardCatalogRecord {
  catalogId: string
  origin: 'STANDARD_REGISTRY'
  instrumentClass: 'STANDARD'
  title: string
  exactVersion: Extract<CatalogExactVersion, { origin: 'STANDARD_REGISTRY' }>
  availability: CatalogAvailability
  authorization: {
    mechanism: 'INSTRUMENT_AUTHORIZATION'
    rights: UnifiedScaleLibraryEntry['rights']
    requiresRuntimeCheck: true
    useGrantStatus: 'NOT_EVALUATED'
  }
  standard: UnifiedScaleLibraryEntry
}
export interface AuthoredCatalogRecord {
  catalogId: string
  origin: 'AUTHORED'
  instrumentClass: 'CUSTOM_DESCRIPTIVE'
  title: string
  exactVersion: Extract<CatalogExactVersion, { origin: 'AUTHORED' }>
  availability: CatalogAvailability
  authorization: {
    mechanism: 'LIBRARY_USE_GRANT'
    requiresRuntimeCheck: true
    useGrantStatus: 'NOT_EVALUATED'
  }
  authored: AuthoredCatalogEntry
}
export type PlatformCatalogRecord = StandardCatalogRecord | AuthoredCatalogRecord

export function standardCatalogRecord(entry: UnifiedScaleLibraryEntry, product: LibraryProduct): StandardCatalogRecord {
  // STANDARD remains bound to its existing rights/scientific/deployment resolver.
  // No launch links in this management projection: directory visibility and even
  // rights approval do not establish this user's exact entrypoint use permission.
  const { launch: _launch, ...availability } = entry.availability
  const standard = { ...entry, availability }
  return {
    catalogId: `standard:${entry.identity.instrumentKey}:${entry.identity.instrumentVersion}`,
    origin: 'STANDARD_REGISTRY', instrumentClass: 'STANDARD', title: entry.identity.canonicalName,
    exactVersion: { origin: 'STANDARD_REGISTRY', instrumentKey: entry.identity.instrumentKey, instrumentVersion: entry.identity.instrumentVersion },
    availability: {
      status: availability.status === 'NOT_AVAILABLE' ? 'NOT_AVAILABLE' : 'RESTRICTED',
      reasons: [...new Set([...availability.reasons, `${product}_EXACT_USER_AUTHORIZATION_NOT_EVALUATED`])],
    },
    authorization: { mechanism: 'INSTRUMENT_AUTHORIZATION', rights: entry.rights, requiresRuntimeCheck: true, useGrantStatus: 'NOT_EVALUATED' },
    standard,
  }
}

export function authoredCatalogRecord(entry: AuthoredCatalogEntry, product: LibraryProduct): AuthoredCatalogRecord {
  const metadata = entry.metadata as { title?: string } | null
  const reasons: string[] = []
  if (entry.status !== 'ACTIVE') reasons.push(`LIBRARY_ENTRY_${entry.status}`)
  if (!entry.supportedEntrypoints.includes(product)) reasons.push(entry.compatibilityReasons[product] ?? 'ENTRYPOINT_NOT_SUPPORTED')
  reasons.push('EXACT_USE_GRANT_AND_RUNTIME_CHECK_REQUIRED')
  return {
    catalogId: `authored:${entry.id}`, origin: 'AUTHORED', instrumentClass: 'CUSTOM_DESCRIPTIVE',
    title: metadata?.title ?? entry.id,
    exactVersion: { origin: 'AUTHORED', entryId: entry.id, releaseId: entry.releaseId, releaseVersion: entry.releaseVersion, contentHash: entry.contentHash },
    availability: { status: entry.status === 'ACTIVE' && entry.supportedEntrypoints.includes(product) ? 'RESTRICTED' : 'NOT_AVAILABLE', reasons },
    authorization: { mechanism: 'LIBRARY_USE_GRANT', requiresRuntimeCheck: true, useGrantStatus: 'NOT_EVALUATED' },
    authored: entry,
  }
}

export function combinePlatformCatalog(standard: readonly UnifiedScaleLibraryEntry[], authored: readonly AuthoredCatalogEntry[], product: LibraryProduct) {
  const list: PlatformCatalogRecord[] = [
    ...standard.map(entry => standardCatalogRecord(entry, product)),
    ...authored.map(entry => authoredCatalogRecord(entry, product)),
  ]
  return { schemaVersion: 1 as const, list }
}

/** A bounded page spanning registry then authored rows, without fetching all
 * authored data or claiming a total without COUNT. Registry order is stable. */
export function platformCatalogPagePlan(standard: readonly UnifiedScaleLibraryEntry[], page: number, pageSize: number) {
  const sorted = [...standard].sort((a, b) => {
    const left = `${a.identity.instrumentKey}:${a.identity.instrumentVersion}`
    const right = `${b.identity.instrumentKey}:${b.identity.instrumentVersion}`
    return left < right ? -1 : left > right ? 1 : 0
  })
  const offset = (page - 1) * pageSize
  const standardPage = sorted.slice(offset, offset + pageSize)
  return {
    standardPage,
    standardHasMore: offset + pageSize < sorted.length,
    authoredOffset: Math.max(0, offset - sorted.length),
    authoredLimit: pageSize - standardPage.length,
  }
}
