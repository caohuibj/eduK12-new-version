import { z } from 'zod'
import sourceTagLabels from './catalog-tag-labels.json'

/** Discovery labels only. Never mutate registry sources, frozen Reference, or
 * infer permission/scientific eligibility from a classification tag. */
export type CatalogTagFacet = 'population' | 'construct' | 'subject' | 'domain' | 'language' | 'orientation' | 'response' | 'use' | 'license' | 'other'
export type CatalogClassificationTag = { id: string; label: string; facet: CatalogTagFacet }
export type CatalogDiscoveryFilters = { keyword?: string; tags?: readonly string[] }
export type CatalogTagFacets = Record<Exclude<CatalogTagFacet, 'other'>, Array<{ id: string; label: string }>>

const labels: Record<string, { label: string; facet: CatalogTagFacet }> = {
  '非商业': { label: '非商业', facet: 'license' },
  non_commercial: { label: '非商业', facet: 'license' },
  'license:noncommercial_only': { label: '仅限非商业', facet: 'license' },
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

type ClassificationMetadata = {
  population?: { respondentTypes?: readonly string[]; minAge?: number; maxAge?: number; gradeRange?: { minGrade: number; maxGrade: number } }
  targetLocale?: string
}
const respondentLabels: Record<string, string> = { SELF: '本人自评', PARENT: '家长评定', TEACHER: '教师评定', OBSERVER: '观察者评定', CLINICIAN: '临床人员评定' }
const languageLabels: Record<string, string> = { 'zh-CN': '简体中文', 'zh-TW': '繁体中文', en: '英语', 'en-US': '英语（美国）', und: '语言未声明' }
const namespaces:Record<string,CatalogTagFacet>={domain:'domain',construct:'construct',orientation:'orientation',population:'population',response:'response',use:'use',license:'license',language_validation:'language',language:'language',subject:'subject'}
const dictionary:Record<string,{label:string;axis:string}>=sourceTagLabels
const classification=(id:string):{label:string;facet:CatalogTagFacet}=>{
  if(Object.prototype.hasOwnProperty.call(domains,id))return {label:domains[id],facet:'domain'}
  if(id.startsWith('sjt-construct:'))return {label:id.slice(14),facet:'construct'}
  if(id.startsWith('respondent:'))return {label:respondentLabels[id.slice(11)]??id.slice(11),facet:'population'}
  if(id.startsWith('language:'))return {label:languageLabels[id.slice(9)]??id.slice(9),facet:'language'}
  const age=/^age:(\d+(?:\.\d+)?)?-(\d+(?:\.\d+)?)?$/.exec(id)
  if(age&&(age[1]||age[2]))return {label:!age[1]?age[2]+'岁及以下':!age[2]?age[1]+'岁及以上':age[1]+'–'+age[2]+'岁',facet:'population'}
  const grades=/^grades:(\d+)-(\d+)$/.exec(id)
  if(grades)return {label:grades[1]+'–'+grades[2]+'年级',facet:'population'}
  if(Object.prototype.hasOwnProperty.call(labels,id))return labels[id]
  const term=Object.prototype.hasOwnProperty.call(dictionary,id)?dictionary[id]:undefined
  const namespace=term?.axis??id.split(':')[0]
  return {label:term?.label??id,facet:Object.prototype.hasOwnProperty.call(namespaces,namespace)?namespaces[namespace]:'other'}
}

/** Reuse the source dictionary for existing free tags, without inferring new
 * applicability or requiring a tool to be classified before publication. */
export const catalogTagsFromIds=(ids:readonly string[]=[])=>[...new Set(ids)].map(id=>({id,...classification(id)}))
export const catalogTagDictionary=()=>Object.fromEntries([...new Set([...Object.keys(dictionary),...Object.keys(labels),...Object.keys(domains),...Object.keys(respondentLabels).map(id=>'respondent:'+id),...Object.keys(languageLabels).map(id=>'language:'+id)])].map(id=>[id,classification(id)]))

export function catalogClassificationTags(construct: { constructOverlapTags?: readonly string[]; primaryDomain?: string }, metadata: ClassificationMetadata = {}): CatalogClassificationTag[] {
  const result = [...new Set(construct.constructOverlapTags ?? [])].map(id => ({
    id, ...classification(id),
  }))
  if (construct.primaryDomain && !result.some(tag => tag.id === construct.primaryDomain)) {
    result.push({ id: construct.primaryDomain, label: domains[construct.primaryDomain] ?? construct.primaryDomain, facet: 'domain' })
  }
  for (const respondent of metadata.population?.respondentTypes ?? []) {
    result.push({ id: 'respondent:' + respondent, label: respondentLabels[respondent] ?? respondent, facet: 'population' })
  }
  const population = metadata.population
  if (population?.minAge !== undefined || population?.maxAge !== undefined) {
    result.push({ id: `age:${population.minAge ?? ''}-${population.maxAge ?? ''}`, label: population.minAge === undefined ? `${population.maxAge}岁及以下` : population.maxAge === undefined ? `${population.minAge}岁及以上` : `${population.minAge}–${population.maxAge}岁`, facet: 'population' })
  }
  if (population?.gradeRange) {
    const { minGrade, maxGrade } = population.gradeRange
    result.push({ id: `grades:${minGrade}-${maxGrade}`, label: `${minGrade}–${maxGrade}年级`, facet: 'population' })
  }
  if (metadata.targetLocale && metadata.targetLocale !== 'und') {
    result.push({ id: 'language:' + metadata.targetLocale, label: languageLabels[metadata.targetLocale] ?? metadata.targetLocale, facet: 'language' })
  }
  return [...new Map(result.map(tag=>[tag.id,tag])).values()]
}

export const scaleEntryClassificationTags = (entry: { construct: Parameters<typeof catalogClassificationTags>[0]; applicability?: ClassificationMetadata['population']; localization?: { targetLocale?: string } }) =>
  catalogClassificationTags(entry.construct, { population: entry.applicability, targetLocale: entry.localization?.targetLocale })

export const scaleSourceClassificationTags = (source: { catalog: { construct: Parameters<typeof catalogClassificationTags>[0]; population?: ClassificationMetadata['population'] }; localization?: { targetLocale?: string }; executable?: { contentLocale?: string } }) =>
  catalogClassificationTags(source.catalog.construct, { population: source.catalog.population, targetLocale: source.executable?.contentLocale ?? source.localization?.targetLocale })

export function catalogTagFacets(tagLists: readonly (readonly CatalogClassificationTag[])[]): CatalogTagFacets {
  const facets: CatalogTagFacets = { population: [], construct: [], subject: [], domain: [], language: [], orientation: [], response: [], use: [], license: [] }
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
