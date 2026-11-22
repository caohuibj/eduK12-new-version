import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareRelease } from '../../modules/measurement-content/release'
import {
  contentReleaseCacheStats,
  getContentRelease,
  getContentReleaseBatch,
  resetContentReleaseCacheForTests,
} from '../../modules/measurement-content/repository'

const hash = 'a'.repeat(64)
const rawInput = (key = 'private:owner:scale-1') => ({
  family: 'SCALE' as const,
  layer: 'MEASUREMENT' as const,
  key,
  version: '1.0',
  scope: { kind: 'PRIVATE' as const, ownerId: 'owner', product: 'TRAINING' as const, resourceId: 'course' },
  provenance: { source: 'test' },
  assetRefs: [],
  sourceReleaseId: null,
  content: {
    projectionVersion: 1,
    instrumentVersion: '1.0',
    measurementHash: hash,
    measurementHashScheme: 'SCALE_AXES_V1',
    scoringVersion: '1',
    runnerKey: 'scale',
    runnerVersion: '2',
    locale: 'zh-CN',
    localizationVersion: '1',
    metrics: [{ metricKey: 'total', unit: 'points', direction: 'descriptive' }],
    executable: { items: [{ key: 'q1' }] },
  },
})

const buildDbRow = (id: string, key: string, status: 'PUBLISHED' | 'REVOKED' = 'PUBLISHED', metaHash = 'meta-1') => {
  const prepared = prepareRelease(rawInput(key))
  const header = {
    id,
    layer: prepared.layer,
    family: prepared.family,
    content_key: prepared.key,
    version: prepared.version,
    hash_scheme: prepared.hashScheme,
    content_hash: prepared.contentHash,
    meta_hash: metaHash,
    published_by: 'admin',
    published_at: new Date('2026-11-22T00:00:00Z'),
    status,
  }
  const full = {
    ...header,
    content: prepared.content,
    scope: prepared.scope,
    provenance: prepared.provenance,
    asset_refs: prepared.assetRefs,
    source_release_id: prepared.sourceReleaseId,
  }
  return { prepared, header, full }
}

const sqlText = (query: any): string => (
  Array.isArray(query?.strings) ? query.strings.join('?') : String(query?.sql ?? query)
)

describe('measurement-content immutable payload cache', () => {
  beforeEach(() => {
    resetContentReleaseCacheForTests()
  })

  it('reuses verified immutable payloads on warm header hits while reflecting live status changes and FOR SHARE locks', async () => {
    const id = '00000000-0000-4000-8000-000000000001'
    let status: 'PUBLISHED' | 'REVOKED' = 'PUBLISHED'
    const queries: string[] = []
    const db = {
      $queryRaw: vi.fn(async (query: any) => {
        const text = sqlText(query)
        queries.push(text)
        const { header, full } = buildDbRow(id, 'private:owner:scale-1', status)
        if (text.includes('SELECT * FROM measurement_content_releases')) return [full]
        return [header]
      }),
    }

    const first = await getContentRelease(db as never, id, true)
    expect(first?.releaseId).toBe(id)
    expect(first?.status).toBe('PUBLISHED')
    expect(queries).toHaveLength(2)
    expect(queries[0]).toContain('FOR SHARE')
    expect(queries[1]).toContain('SELECT * FROM measurement_content_releases')

    status = 'REVOKED'
    const second = await getContentRelease(db as never, id, true)
    expect(second?.releaseId).toBe(id)
    expect(second?.status).toBe('REVOKED')
    expect(queries).toHaveLength(3)
    expect(queries[2]).not.toContain('SELECT *')
    expect(queries[2]).toContain('FOR SHARE')
    expect(contentReleaseCacheStats().hits).toBe(1)
  })

  it('fetches SELECT * only for uncached IDs in getContentReleaseBatch and invalidates on meta_hash change', async () => {
    const id1 = '00000000-0000-4000-8000-000000000011'
    const id2 = '00000000-0000-4000-8000-000000000012'
    let meta1 = 'meta-v1'
    const fullFetches: string[][] = []
    const db = {
      $queryRaw: vi.fn(async (query: any) => {
        const text = sqlText(query)
        const rows = [
          buildDbRow(id1, 'private:owner:s1', 'PUBLISHED', meta1),
          buildDbRow(id2, 'private:owner:s2', 'PUBLISHED', 'meta-v1'),
        ]
        const requested = (query?.values ?? []).filter((v: unknown): v is string => v === id1 || v === id2)
        if (text.includes('SELECT * FROM measurement_content_releases')) {
          fullFetches.push(requested)
          return rows.filter(r => requested.includes(r.full.id)).map(r => r.full)
        }
        return rows.filter(r => requested.includes(r.header.id)).map(r => r.header)
      }),
    }

    const warm1 = await getContentReleaseBatch(db as never, [id1])
    expect(warm1.size).toBe(1)
    expect(fullFetches).toEqual([[id1]])

    const warmBoth = await getContentReleaseBatch(db as never, [id1, id2])
    expect(warmBoth.size).toBe(2)
    expect(fullFetches).toEqual([[id1], [id2]])

    const allCached = await getContentReleaseBatch(db as never, [id1, id2])
    expect(allCached.size).toBe(2)
    expect(fullFetches).toEqual([[id1], [id2]])

    meta1 = 'meta-v2'
    await getContentReleaseBatch(db as never, [id1, id2])
    expect(fullFetches).toEqual([[id1], [id2], [id1]])
  })

  it('decodes legacy mocked full rows directly without stale cache reuse', async () => {
    const id = '00000000-0000-4000-8000-000000000099'
    const { full } = buildDbRow(id, 'private:owner:mocked')
    const db = { $queryRaw: vi.fn(async () => [full]) }

    const release = await getContentRelease(db as never, id)
    expect(release?.releaseId).toBe(id)
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
    expect(contentReleaseCacheStats().entries).toBe(0)
  })
})
