import { z } from 'zod'

/** Discovery labels only. Never mutate registry sources, frozen Reference, or
 * infer permission/scientific eligibility from a classification tag. */
export type CatalogTagFacet = 'population' | 'construct' | 'subject' | 'domain' | 'other'
export type CatalogClassificationTag = { id: string; label: string; facet: CatalogTagFacet }
export type CatalogDiscoveryFilters = { keyword?: string; tags?: readonly string[] }
export type CatalogTagFacets = Record<Exclude<CatalogTagFacet, 'other'>, Array<{ id: string; label: string }>>

const labels: Record<string, { label: string; facet: CatalogTagFacet }> = {
  student_self_report: { label: '学生', facet: 'population' },
  academic_self_concept: { label: '学科自我概念', facet: 'construct' },
  academic_self_efficacy: { label: '学科学习自我效能', facet: 'construct' },
  domain_fixed_mindset: { label: '学科固定心态', facet: 'construct' },
  teacher_subject_liking: { label: '学生感知的教师学科喜爱', facet: 'construct' },
  tutoring_necessity: { label: '补习必要性信念', facet: 'construct' },
  value_cost: { label: '学科价值与时间代价', facet: 'construct' },
  chinese: { label: '语文', facet: 'subject' },
  mathematics: { label: '数学', facet: 'subject' },
  english: { label: '英语', facet: 'subject' },
  physics: { label: '物理', facet: 'subject' },
  chemistry: { label: '化学', facet: 'subject' },
  biology: { label: '生物', facet: 'subject' },
}
const domains: Record<string, string> = {
  WELL_BEING: '身心健康', EXECUTIVE_FUNCTION: '执行功能', SELF_REGULATION: '自我调节',
  SOCIAL_EMOTIONAL: '社会情绪', SCHOOL_BELONGING: '学校归属', MOTIVATION: '学习动机',
  SELF_EFFICACY: '自我效能', RESILIENCE: '韧性', PERSONALITY: '人格',
  BEHAVIORAL_DIFFICULTIES: '行为与困难', SCHOOL_CLIMATE: '学校氛围', ENGAGEMENT: '投入',
  PARENT_OBSERVATION: '家长观察', TEACHER_OBSERVATION: '教师观察',
}

export const catalogDiscoveryQueryFields = {
  keyword: z.string().trim().max(100).default(''),
  tags: z.string().max(1000).default('').transform(value => [...new Set(value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean))])
    .pipe(z.array(z.string().min(1).max(100)).max(10)),
}

export function catalogClassificationTags(construct: { constructOverlapTags?: readonly string[]; primaryDomain?: string }): CatalogClassificationTag[] {
  const result = [...new Set(construct.constructOverlapTags ?? [])].map(id => ({
    id, ...(Object.prototype.hasOwnProperty.call(labels, id) ? labels[id] : { label: id, facet: 'other' as const }),
  }))
  if (construct.primaryDomain && !result.some(tag => tag.id === construct.primaryDomain)) {
    result.push({ id: construct.primaryDomain, label: domains[construct.primaryDomain] ?? construct.primaryDomain, facet: 'domain' })
  }
  return result
}

export function catalogTagFacets(tagLists: readonly (readonly CatalogClassificationTag[])[]): CatalogTagFacets {
  const facets: CatalogTagFacets = { population: [], construct: [], subject: [], domain: [] }
  for (const tags of tagLists) for (const { id, label, facet } of tags) {
    if (facet !== 'other' && !facets[facet].some(tag => tag.id === id)) facets[facet].push({ id, label })
  }
  for (const tags of Object.values(facets)) tags.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN') || a.id.localeCompare(b.id))
  return facets
}

export const catalogKeywordTerms = (keyword = '') => keyword.trim().toLowerCase().split(/\s+/).filter(Boolean)

export function matchesCatalogDiscovery(text: readonly string[], tags: readonly CatalogClassificationTag[], filters: CatalogDiscoveryFilters = {}) {
  // Multiple facets are ANDed. Unknown IDs return no matches, never broaden a query.
  if (filters.tags?.some(id => !tags.some(tag => tag.id === id))) return false
  const haystack = [...text, ...tags.flatMap(tag => [tag.id, tag.label])].join(' ').toLowerCase()
  return catalogKeywordTerms(filters.keyword).every(term => haystack.includes(term))
}
