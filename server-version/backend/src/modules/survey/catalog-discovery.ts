import { Prisma } from '@prisma/client'
import { listScaleInstrumentSources } from '../scale/onboarding/instrument-registry'
import { listCognitiveRegistryEntries } from '../cognitive/cognitive.registry'
import { deriveCatalogDomainSummary } from '../cognitive/library/catalog'
import { getCognitiveDomainDefinition } from '../cognitive-analysis/domain.registry'
import {
  catalogKeywordTerms, catalogTagFacets, matchesCatalogDiscovery, scaleSourceClassificationTags,
  type CatalogClassificationTag, type CatalogDiscoveryFilters,
} from '../scale/library/catalog-discovery'

/** Management discovery only. These labels never enter an executable snapshot,
 * approval hash, rights decision, scientific qualification or participant result. */
export type DiscoveryRecord = {
  kind: 'SCALE' | 'COGNITIVE'; key: string; version: string; engine: string; scoring: string
  tags: CatalogClassificationTag[]; ids: string[]; terms: string
}

export function cognitiveClassificationTags(testType: string, engine: string, scoring: string): CatalogClassificationTag[] {
  const tags: CatalogClassificationTag[] = []
  for (const summary of deriveCatalogDomainSummary(testType, engine, scoring)) {
    const definition = getCognitiveDomainDefinition(summary.domain as Parameters<typeof getCognitiveDomainDefinition>[0])
    if (!definition) continue
    tags.push({ id: 'cognitive-domain:' + summary.domain, label: definition.label, facet: 'domain' })
    for (const facet of summary.facets) {
      const declared = definition.facets.find(item => item.key === facet.facet)
      if (declared) tags.push({ id: `cognitive-facet:${summary.domain}/${facet.facet}`, label: declared.label, facet: 'construct' })
    }
  }
  // Catalog and reference populations are different facts. No age, language or
  // student applicability is inferred from the task name or reference sample.
  return tags
}

export function catalogDiscoveryRecords(): DiscoveryRecord[] {
  const scales = listScaleInstrumentSources().map(source => {
    const tags = scaleSourceClassificationTags(source)
    return { kind: 'SCALE' as const, key: source.identity.instrumentKey, version: source.identity.instrumentVersion, engine: '', scoring: '', tags,
      ids: tags.map(tag => tag.id), terms: [source.catalog.identity.canonicalName, source.catalog.construct.constructDefinition, ...tags.flatMap(tag => [tag.id, tag.label])].join(' ').toLowerCase() }
  })
  const cognitive = listCognitiveRegistryEntries().filter(entry => entry.testType !== 'fake').map(entry => {
    const tags = cognitiveClassificationTags(entry.testType, entry.engineVersion, entry.scoringVersion)
    return { kind: 'COGNITIVE' as const, key: entry.testType, version: '', engine: entry.engineVersion, scoring: entry.scoringVersion, tags,
      ids: tags.map(tag => tag.id), terms: [entry.testType, ...tags.flatMap(tag => [tag.id, tag.label])].join(' ').toLowerCase() }
  })
  return [...scales, ...cognitive]
}

export const discoveryFacets = (records: readonly DiscoveryRecord[], family?: string) => catalogTagFacets(records.filter(record => !family || record.kind === family).map(record => record.tags))

/** A small source-owned metadata table, not a second persisted catalog. SQL joins
 * exact declared identities; unregistered/private versions retain empty labels. */
export function discoveryJoin(records: readonly DiscoveryRecord[], identity: { kind: Prisma.Sql; key: Prisma.Sql; version: Prisma.Sql; engine: Prisma.Sql; scoring: Prisma.Sql }) {
  return Prisma.sql`LEFT JOIN LATERAL (
    SELECT d.tags, d.ids, d.terms FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb)
      AS d(kind text,key text,version text,engine text,scoring text,tags jsonb,ids jsonb,terms text)
    WHERE d.kind=${identity.kind} AND d.key=${identity.key}
      AND (d.kind='SCALE' AND d.version=${identity.version}
        OR d.kind='COGNITIVE' AND d.engine=${identity.engine} AND d.scoring=${identity.scoring})
    LIMIT 1
  ) AS discovery ON TRUE`
}

export const governedDiscoveryIdentity = {
  kind: Prisma.sql`t.family`, key: Prisma.sql`CASE WHEN t.family='SCALE' THEN t.snapshot#>>'{unit,provenance,code}' ELSE t.snapshot#>>'{unit,compiledDefinition,sessionSnapshot,testType}' END`,
  version: Prisma.sql`t.snapshot#>>'{unit,ref,sourceVersion}'`, engine: Prisma.sql`t.snapshot#>>'{unit,compiledDefinition,sessionSnapshot,engineVersion}'`, scoring: Prisma.sql`t.snapshot#>>'{unit,compiledDefinition,sessionSnapshot,scoringVersion}'`,
}

export function discoverySqlFilter(text: readonly Prisma.Sql[], filters: CatalogDiscoveryFilters = {}) {
  const tags = filters.tags?.length ? Prisma.sql`COALESCE(discovery.ids,'[]'::jsonb) @> ${JSON.stringify(filters.tags)}::jsonb` : Prisma.sql`TRUE`
  const terms = catalogKeywordTerms(filters.keyword).map(term => Prisma.sql`strpos(lower(concat_ws(' ',${Prisma.join([...text, Prisma.sql`discovery.terms`])})),${term})>0`)
  return Prisma.sql`${tags}${terms.length ? Prisma.sql` AND ${Prisma.join(terms, ' AND ')}` : Prisma.empty}`
}

/** Prisma-side equivalent for raw published rows. The AND is applied before
 * skip/take, so Chinese label search can find a version on any original page. */
export function scaleDiscoveryWhere(records: readonly DiscoveryRecord[], filters: CatalogDiscoveryFilters): Prisma.ScaleWhereInput {
  if (!filters.tags?.length && !catalogKeywordTerms(filters.keyword).length) return {}
  const scales = records.filter(record => record.kind === 'SCALE')
  const exact = (rows: readonly DiscoveryRecord[]): Prisma.ScaleWhereInput => ({ OR: rows.map(row => ({ code: row.key, instrumentVersion: row.version })) })
  return { AND: [
    ...(filters.tags?.length ? [exact(scales.filter(row => matchesCatalogDiscovery([], row.tags, { tags: filters.tags })))] : []),
    ...catalogKeywordTerms(filters.keyword).map(term => ({ OR: [{ name: { contains: term, mode: 'insensitive' as const } }, { code: { contains: term, mode: 'insensitive' as const } }, exact(scales.filter(row => row.terms.includes(term)))] })),
  ] }
}

export function cognitiveDiscoveryWhere(records: readonly DiscoveryRecord[], filters: CatalogDiscoveryFilters): Prisma.CognitiveTestConfigWhereInput {
  if (!filters.tags?.length && !catalogKeywordTerms(filters.keyword).length) return {}
  const cognitive = records.filter(record => record.kind === 'COGNITIVE')
  const exact = (rows: readonly DiscoveryRecord[]): Prisma.CognitiveTestConfigWhereInput => ({ OR: rows.map(row => ({ testType: row.key, engineVersion: row.engine, scoringVersion: row.scoring })) })
  return { AND: [
    ...(filters.tags?.length ? [exact(cognitive.filter(row => matchesCatalogDiscovery([], row.tags, { tags: filters.tags })))] : []),
    ...catalogKeywordTerms(filters.keyword).map(term => ({ OR: [{ name: { contains: term, mode: 'insensitive' as const } }, { testType: { contains: term, mode: 'insensitive' as const } }, exact(cognitive.filter(row => row.terms.includes(term)))] })),
  ] }
}
