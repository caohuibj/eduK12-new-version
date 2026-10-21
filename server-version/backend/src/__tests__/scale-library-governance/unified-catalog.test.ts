import { describe, expect, it, vi, beforeEach } from 'vitest'
vi.mock('../../config/database', () => ({ prisma: { $transaction: (callback: (tx: unknown) => unknown) => callback({}) } }))
vi.mock('../../modules/scale-library-governance/authority', () => ({ libraryActor: vi.fn().mockResolvedValue({ systemAdmin: true }) }))
vi.mock('../../modules/scale/library/standard-catalog-reader', () => ({ readStandardScaleLibraryForActor: vi.fn() }))
vi.mock('../../modules/scale-library-governance/service', () => ({ listEntries: vi.fn() }))
import { readStandardScaleLibraryForActor } from '../../modules/scale/library/standard-catalog-reader'
import { listEntries } from '../../modules/scale-library-governance/service'
import { readUnifiedCatalog, readUnifiedStandardCatalogEntry } from '../../modules/scale-library-governance/unified-catalog'
import { scaleLibraryController } from '../../controllers/scaleLibraryController'
import type { Request, Response } from 'express'
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


describe('classification across the complete actor-visible catalog', () => {
  beforeEach(() => {
    vi.mocked(listEntries).mockReset()
    vi.mocked(readStandardScaleLibraryForActor).mockReset()
  })

  it.each(['TRAINING', 'SURVEY'] as const)('filters before pagination without fetching unknown authored classification for %s', async product => {
    const model = buildUnifiedScaleLibraryReadModel()
    const base = model.entries[0]
    const entries = ['a', 'b', 'c', 'd'].map((key, index) => ({
      ...base, identity: { ...base.identity, instrumentKey: key },
      construct: { ...base.construct, primaryDomain: 'WELL_BEING' as const, secondaryDomains: ['SELF_REGULATION' as const], constructOverlapTags: index ? ['attention'] : [] },
    }))
    vi.mocked(readStandardScaleLibraryForActor).mockResolvedValue({ ...model, entries })
    const first = await readUnifiedCatalog('actor', product, { page: 1, pageSize: 2, constructDomain: 'SELF_REGULATION', overlapTag: 'attention' })
    expect(first.list.map(row => row.title)).toHaveLength(2)
    expect(first.list.map(row => row.exactVersion)).toEqual(entries.slice(1, 3).map(row => ({ origin: 'STANDARD_REGISTRY', instrumentKey: row.identity.instrumentKey, instrumentVersion: row.identity.instrumentVersion })))
    expect(first.hasMore).toBe(true)
    const second = await readUnifiedCatalog('actor', product, { page: 2, pageSize: 2, overlapTag: 'attention' })
    expect(second.list).toHaveLength(1)
    expect(second.hasMore).toBe(false)
    const empty = await readUnifiedCatalog('actor', product, { page: 1, pageSize: 2, overlapTag: 'unknown-token' })
    expect(empty.list).toEqual([])
    expect(empty.hasMore).toBe(false)
    expect(listEntries).not.toHaveBeenCalled()
    const detail = await readUnifiedStandardCatalogEntry('actor', product, entries[1].identity.instrumentKey, entries[1].identity.instrumentVersion)
    expect(detail.entry).toEqual(first.list[0])
    expect(detail.entry.authorization.rights).toEqual(base.rights)

    vi.mocked(listEntries).mockResolvedValue({ list: [authored()], hasMore: false })
    const reset = await readUnifiedCatalog('actor', product, { page: 3, pageSize: 2 })
    expect(listEntries).toHaveBeenCalledWith('actor', undefined, { offset: 0, limit: 2 })
    expect(reset.list[0].origin).toBe('AUTHORED')
  })

  it('rejects invalid classifications before reading either source', async () => {
    for (const filter of [{ constructDomain: 'UNKNOWN' }, { overlapTag: '' }, { overlapTag: 'x'.repeat(121) }]) {
      await expect(readUnifiedCatalog('actor', 'TRAINING', { page: 1, pageSize: 2, ...filter } as never)).rejects.toMatchObject({ statusCode: 400 })
    }
    expect(readStandardScaleLibraryForActor).not.toHaveBeenCalled()
    expect(listEntries).not.toHaveBeenCalled()
  })

  it('returns HTTP 400 for malformed legacy discovery filter queries rather than silently ignoring them', async () => {
    for (const query of [{ constructDomain: 'UNKNOWN' }, { constructDomain: ['WELL_BEING'] }, { overlapTag: '' }, { overlapTag: ['attention'] }, { overlapTag: 'x'.repeat(121) }]) {
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
      await scaleLibraryController.list({ user: { userId: 'actor', role: 'ADMIN' }, query } as unknown as Request, res as unknown as Response)
      expect(res.status).toHaveBeenCalledWith(400)
    }
    expect(readStandardScaleLibraryForActor).not.toHaveBeenCalled()
  })
})
