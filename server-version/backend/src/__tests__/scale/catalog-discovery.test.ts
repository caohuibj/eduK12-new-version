import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { listScaleInstrumentSources } from '../../modules/scale/onboarding/instrument-registry'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { compileScalePolicy } from '../../modules/scale/policy/compile'
import { sourceParts, composeTriplet, type Axis, type Part } from '../../modules/survey/standard-triplet.model'
import { buildUnifiedScaleLibraryReadModel, filterUnifiedScaleLibraryEntries } from '../../modules/scale/library/catalog-only-read-model'
import { catalogClassificationTags, catalogTagFacets, catalogDiscoveryQueryFields, matchesCatalogDiscovery } from '../../modules/scale/library/catalog-discovery'

const families = ['academic_self_concept', 'academic_self_efficacy', 'domain_fixed_mindset', 'teacher_subject_liking', 'tutoring_necessity', 'value_cost']
const subjects = ['chinese', 'mathematics', 'english', 'physics', 'chemistry', 'biology']
const sources = listScaleInstrumentSources().filter(source => families.some(family => subjects.some(subject => source.identity.instrumentKey === `${family}_${subject}_zh_cn`)))
const tagged = sources.map(source => ({ source, tags: catalogClassificationTags(source.catalog.construct) }))
const match = (keyword = '', tags: string[] = []) => tagged.filter(row => matchesCatalogDiscovery([row.source.catalog.identity.canonicalName], row.tags, { keyword, tags }))

describe('content-backed catalog labels without changing approved source identities', () => {
  it('labels all 36 student versions by population, measurement construct and subject', () => {
    expect(sources).toHaveLength(36)
    expect(match('学生')).toHaveLength(36)
    for (const { tags } of tagged) {
      expect(tags).toContainEqual({ id: 'student_self_report', label: '学生', facet: 'population' })
      expect(tags.filter(tag => tag.facet === 'construct')).toHaveLength(1)
      expect(tags.filter(tag => tag.facet === 'subject')).toHaveLength(1)
      expect(tags).toContainEqual({ id: 'MOTIVATION', label: '学习动机', facet: 'domain' })
    }
  })
  it.each(subjects)('finds six constructs for subject %s, including the legacy tag ID', subject => {
    expect(match('', [subject, 'student_self_report'])).toHaveLength(6)
    expect(match(subject)).toHaveLength(6)
  })
  it.each(families)('finds six subjects for construct %s and one intersecting version', family => {
    expect(match('', [family])).toHaveLength(6)
    expect(match('', [family, 'mathematics', 'student_self_report'])).toHaveLength(1)
  })
  it('matches Chinese aliases and multiple keyword terms while unknown tags stay empty', () => {
    expect(match('学生 数学')).toHaveLength(6)
    expect(match('学科自我概念 数学')).toHaveLength(1)
    expect(match('学习动机')).toHaveLength(36)
    expect(match('STUDENT_SELF_REPORT')).toHaveLength(36)
    expect(match('', ['not_a_tag'])).toHaveLength(0)
    // Match literal Unicode consistently with the authored SQL substring query.
    expect(matchesCatalogDiscovery(['ＭＡＴＨ 量表'], [], { keyword: 'ＭＡＴＨ' })).toBe(true)
    expect(matchesCatalogDiscovery(['ＭＡＴＨ 量表'], [], { keyword: 'math' })).toBe(false)
    expect(catalogClassificationTags({ constructOverlapTags: ['unknown', 'unknown', 'constructor'] })).toEqual([
      { id: 'unknown', label: 'unknown', facet: 'other' }, { id: 'constructor', label: 'constructor', facet: 'other' },
    ])
  })
  it('offers complete deduplicated facets independently of a returned page', () => {
    const facets = catalogTagFacets(tagged.map(row => row.tags))
    expect(facets.population).toEqual([{ id: 'student_self_report', label: '学生' }])
    expect(facets.construct).toHaveLength(6)
    expect(facets.subject).toHaveLength(6)
    expect(facets.domain).toEqual([{ id: 'MOTIVATION', label: '学习动机' }])
  })
  it('bounds and normalizes query input without accepting arbitrary arrays or oversized searches', () => {
    const schema = z.object(catalogDiscoveryQueryFields)
    expect(schema.parse({ tags: ' student_self_report，mathematics,mathematics ', keyword: ' 数学 ' })).toEqual({ tags: ['student_self_report', 'mathematics'], keyword: '数学' })
    expect(schema.safeParse({ tags: ['mathematics'] }).success).toBe(false)
    expect(schema.safeParse({ keyword: 'x'.repeat(101) }).success).toBe(false)
    expect(schema.safeParse({ tags: Array.from({ length: 11 }, (_, i) => `tag${i}`).join(',') }).success).toBe(false)
  })
  it('leaves complete source/policy fingerprints, measurement hash, all axes and frozen Reference unchanged', () => {
    for (const source of sources) {
      const parts = () => Object.fromEntries(sourceParts(source.identity.instrumentKey, source.identity.instrumentVersion).map(part => [part.axis, part])) as Record<Axis, Part>
      const before = {
        source: canonicalHash(source), definition: hashScaleDefinition(source.executable!.definition),
        runtime: compileScalePolicy(source).runtimePolicyHash,
        triplet: canonicalHash(composeTriplet(source.identity.instrumentKey, parts())),
      }
      const tags = catalogClassificationTags(source.catalog.construct)
      matchesCatalogDiscovery([source.catalog.identity.canonicalName], tags, { keyword: '学生', tags: ['MOTIVATION'] })
      // Returned labels are detached values, not an editable view of the registry.
      tags[0].label = 'changed display only'
      expect({
        source: canonicalHash(source), definition: hashScaleDefinition(source.executable!.definition),
        runtime: compileScalePolicy(source).runtimePolicyHash,
        triplet: canonicalHash(composeTriplet(source.identity.instrumentKey, parts())),
      }).toEqual(before)
    }
  })
  it('reuses aliases and exact tag filtering in the general library without altering availability', () => {
    const model = buildUnifiedScaleLibraryReadModel({ locale: 'zh-CN', territory: 'CN', viewerRole: 'ADMIN', nowIso: '2026-10-25T00:00:00.000Z' })
    const subset = model.entries.filter(entry => sources.some(source => source.identity.instrumentKey === entry.identity.instrumentKey))
    const before = subset.map(entry => canonicalHash(entry.availability))
    expect(filterUnifiedScaleLibraryEntries(subset, { keyword: '学生' })).toHaveLength(36)
    expect(filterUnifiedScaleLibraryEntries(subset, { tags: ['mathematics', 'MOTIVATION'] })).toHaveLength(6)
    expect(filterUnifiedScaleLibraryEntries(subset, { keyword: 'student_self_report', tags: ['value_cost', 'biology'] })).toHaveLength(1)
    expect(subset.map(entry => canonicalHash(entry.availability))).toEqual(before)
  })
})
