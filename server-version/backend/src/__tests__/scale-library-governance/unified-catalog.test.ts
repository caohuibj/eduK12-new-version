import { describe, expect, it } from 'vitest'
import { buildUnifiedScaleLibraryReadModel } from '../../modules/scale/library/catalog-only-read-model'
import {
  authoredCatalogRecord, combinePlatformCatalog, platformCatalogPagePlan, standardCatalogRecord,
  type AuthoredCatalogEntry,
} from '../../modules/scale-library-governance/unified-catalog-model'

const authored = (changes: Partial<AuthoredCatalogEntry> = {}): AuthoredCatalogEntry => ({
  id: 'entry-1', submissionId: 'submission-1', releaseId: 'release-1', releaseVersion: '1.2.0', contentHash: 'a'.repeat(64),
  product: 'SURVEY', sourceId: 'source-1', supportedEntrypoints: ['TRAINING', 'SURVEY'], compatibilityReasons: {},
  mediaManifest: undefined, snapshotOrigin: undefined, definitionHash: undefined,
  metadata: { title: 'Approved authored scale', author: 'Historical author' }, dependencyReleaseIds: [],
  status: 'ACTIVE', version: 7, reason: null, createdAt: new Date('2026-10-21T00:00:00Z'), ...changes,
})

describe('one platform catalog preserving source-owned exact identities', () => {
  it('combines real registry projections and approved authored entries in one result', () => {
    const standard = buildUnifiedScaleLibraryReadModel({ viewerRole: 'ADMIN' }).entries
    expect(standard.length).toBeGreaterThan(0)
    const result = combinePlatformCatalog(standard, [authored()], 'TRAINING')
    expect(result.list).toHaveLength(standard.length + 1)
    expect(new Set(result.list.map(row => row.catalogId)).size).toBe(result.list.length)
    const first = result.list[0]
    expect(first.origin).toBe('STANDARD_REGISTRY')
    expect(first.instrumentClass).toBe('STANDARD')
    expect(first.exactVersion).toEqual({ origin: 'STANDARD_REGISTRY', ...Object.fromEntries(
      Object.entries(standard[0].identity).filter(([key]) => ['instrumentKey', 'instrumentVersion'].includes(key)),
    ) })
    expect(first).not.toHaveProperty('authored')
    expect(first).not.toHaveProperty('submissionId')
  })

  it('never promotes an undeployed formal catalog entry to usable or invents approval records', () => {
    const standard = buildUnifiedScaleLibraryReadModel({ viewerRole: 'ADMIN', deployments: [], authorizations: [] }).entries
    for (const source of standard) {
      const record = standardCatalogRecord(source, 'SURVEY')
      expect(record.availability.status).not.toBe('AVAILABLE')
      expect(record.standard.availability).not.toHaveProperty('launch')
      expect(record.standard.rights).toEqual(source.rights)
      expect(record.standard.governance).toEqual(source.governance)
      expect(record.authorization.mechanism).toBe('INSTRUMENT_AUTHORIZATION')
      expect(record.authorization.requiresRuntimeCheck).toBe(true)
      expect(record.authorization.useGrantStatus).toBe('NOT_EVALUATED')
    }
  })

  it('does not treat standard rights/deployment availability as this entrypoint user authorization', () => {
    const source = buildUnifiedScaleLibraryReadModel().entries[0]
    const available = { ...source, availability: { ...source.availability, status: 'AVAILABLE' as const, reasons: [], launch: { scaleId: 'deployed-1', route: '/scales/deployed-1' } } }
    for (const product of ['TRAINING', 'SURVEY'] as const) {
      const result = standardCatalogRecord(available, product)
      expect(result.availability).toEqual({ status: 'RESTRICTED', reasons: [`${product}_EXACT_USER_AUTHORIZATION_NOT_EVALUATED`] })
      expect(result.standard.availability).not.toHaveProperty('launch')
      expect(available.availability.launch).toBeDefined()
    }
  })

  it('keeps authored release identity separate from governance revision and source product', () => {
    const source = authored()
    const result = authoredCatalogRecord(source, 'TRAINING')
    expect(result.exactVersion).toEqual({ origin: 'AUTHORED', entryId: 'entry-1', releaseId: 'release-1', releaseVersion: '1.2.0', contentHash: 'a'.repeat(64) })
    expect(result.authored.version).toBe(7)
    expect(result.authored.product).toBe('SURVEY')
    expect(result.authorization.mechanism).toBe('LIBRARY_USE_GRANT')
    expect(result.availability.status).toBe('RESTRICTED')
    expect(result.availability.reasons).toEqual(['EXACT_USE_GRANT_AND_RUNTIME_CHECK_REQUIRED'])
  })

  it('keeps withdrawal/emergency and unsupported rendering unavailable even for previously approved metadata', () => {
    for (const status of ['WITHDRAWN', 'EMERGENCY_DISABLED']) {
      const result = authoredCatalogRecord(authored({ status }), 'SURVEY')
      expect(result.availability.status).toBe('NOT_AVAILABLE')
      expect(result.availability.reasons).toContain(`LIBRARY_ENTRY_${status}`)
    }
    const result = authoredCatalogRecord(authored({ supportedEntrypoints: ['SURVEY'], compatibilityReasons: { TRAINING: 'Renderer cannot preserve presentation' } }), 'TRAINING')
    expect(result.availability.status).toBe('NOT_AVAILABLE')
    expect(result.availability.reasons).toContain('Renderer cannot preserve presentation')
  })
})

describe('bounded unified catalog pagination', () => {
  it('spans the registry/authored boundary without dropping or repeating authored offsets', () => {
    const base = buildUnifiedScaleLibraryReadModel().entries[0]
    const standard = ['c', 'a', 'b'].map(key => ({ ...base, identity: { ...base.identity, instrumentKey: key } }))
    const first = platformCatalogPagePlan(standard, 1, 2)
    expect(first.standardPage.map(row => row.identity.instrumentKey)).toEqual(['a', 'b'])
    expect(first).toMatchObject({ authoredOffset: 0, authoredLimit: 0, standardHasMore: true })
    const second = platformCatalogPagePlan(standard, 2, 2)
    expect(second.standardPage.map(row => row.identity.instrumentKey)).toEqual(['c'])
    expect(second).toMatchObject({ authoredOffset: 0, authoredLimit: 1, standardHasMore: false })
    expect(platformCatalogPagePlan(standard, 3, 2)).toMatchObject({ standardPage: [], authoredOffset: 1, authoredLimit: 2, standardHasMore: false })
    expect(platformCatalogPagePlan(standard, 100, 2)).toMatchObject({ standardPage: [], authoredOffset: 195, authoredLimit: 2 })
    expect(standard.map(row => row.identity.instrumentKey)).toEqual(['c', 'a', 'b'])
  })

  it('supports an empty registry and exact registry page boundaries', () => {
    expect(platformCatalogPagePlan([], 2, 25)).toMatchObject({ standardPage: [], authoredOffset: 25, authoredLimit: 25, standardHasMore: false })
    const base = buildUnifiedScaleLibraryReadModel().entries[0]
    expect(platformCatalogPagePlan([base], 1, 1)).toMatchObject({ authoredOffset: 0, authoredLimit: 0, standardHasMore: false })
    expect(platformCatalogPagePlan([base], 2, 1)).toMatchObject({ standardPage: [], authoredOffset: 0, authoredLimit: 1 })
  })
})
