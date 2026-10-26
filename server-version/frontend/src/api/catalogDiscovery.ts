export const CATALOG_FACETS = ['population', 'construct', 'subject', 'domain', 'language', 'orientation', 'response', 'use', 'license'] as const
export type CatalogFacet = typeof CATALOG_FACETS[number]
type LegacyFacet='population'|'construct'|'subject'|'domain'|'language'
type AddedFacet=Exclude<CatalogFacet,LegacyFacet>
export type CatalogTagOption = { id: string; label: string }
export type CatalogClassificationTag = CatalogTagOption & { facet: CatalogFacet | 'other' }
export type CatalogTagFacets = Record<LegacyFacet, CatalogTagOption[]> & Partial<Record<AddedFacet, CatalogTagOption[]>>
export type CatalogOrigin = 'ALL' | 'STANDARD_REGISTRY' | 'AUTHORED'
export type CatalogFilters = Record<LegacyFacet, string> & Partial<Record<AddedFacet, string>> & { keyword: string; origin: CatalogOrigin }
export type CatalogDiscoveryPage<T> = { list: T[]; page?: number; hasMore: boolean; tagFacets?: CatalogTagFacets }

export const EMPTY_CATALOG_FACETS: CatalogTagFacets = { population: [], construct: [], subject: [], domain: [], language: [], orientation: [], response: [], use: [], license: [] }
export const EMPTY_CATALOG_FILTERS: CatalogFilters = { keyword: '', population: '', construct: '', subject: '', domain: '', language: '', orientation: '', response: '', use: '', license: '', origin: 'ALL' }
export const CATALOG_FACET_LABELS: Record<CatalogFacet | 'other', string> = {
  population: '人群', construct: '测量内容', subject: '学科', domain: '领域', language: '语言', other: '其他',
  orientation:'理论取向',response:'作答方式',use:'使用场景',license:'许可说明',
}

// Stable source IDs remain unchanged in requests, even when the display label is localized.
export function catalogTagLabel(tag: CatalogTagOption): string {
  if (tag.id === 'MOTIVATION') return '学习动机'
  if (tag.id === 'student_self_report') return '学生'
  return tag.label || tag.id
}

export function catalogQuery(page: number, filters: CatalogFilters, includeOrigin = false): string {
  const query = new URLSearchParams({ page: String(page) })
  if (filters.keyword.trim()) query.set('keyword', filters.keyword.trim())
  const tags = [...new Set(CATALOG_FACETS.map(facet => filters[facet]).filter(Boolean))]
  if (tags.length) query.set('tags', tags.join(','))
  if (includeOrigin && filters.origin !== 'ALL') query.set('origin', filters.origin)
  return query.toString()
}
