import { describe, expect, it } from 'vitest'
import { catalogQuery, catalogTagLabel, EMPTY_CATALOG_FILTERS } from './catalogDiscovery'

describe('catalog discovery display and request contract', () => {
  it('localizes known source IDs without using the display label as the request value', () => {
    expect(catalogTagLabel({ id: 'MOTIVATION', label: 'MOTIVATION' })).toBe('学习动机')
    expect(catalogTagLabel({ id: 'student_self_report', label: 'student_self_report' })).toBe('学生')
    expect(catalogTagLabel({ id: 'self_efficacy', label: '自我效能' })).toBe('自我效能')
    const query = new URLSearchParams(catalogQuery(2, { ...EMPTY_CATALOG_FILTERS, population: 'student_self_report', construct: 'MOTIVATION' }))
    expect(query.get('tags')).toBe('student_self_report,MOTIVATION')
    expect(query.get('page')).toBe('2')
  })

  it('omits empty filters, deduplicates IDs, and scopes origin to the Survey catalog', () => {
    expect(catalogQuery(1, EMPTY_CATALOG_FILTERS, true)).toBe('page=1')
    const filters = { ...EMPTY_CATALOG_FILTERS, keyword: '  学习 & 兴趣  ', construct: 'MOTIVATION', domain: 'MOTIVATION', origin: 'AUTHORED' as const }
    const query = new URLSearchParams(catalogQuery(1, filters, true))
    expect(query.get('keyword')).toBe('学习 & 兴趣')
    expect(query.get('tags')).toBe('MOTIVATION')
    expect(query.get('origin')).toBe('AUTHORED')
    expect(new URLSearchParams(catalogQuery(1, filters)).has('origin')).toBe(false)
  })
})

describe('eight-axis request compatibility',()=>{
 it('preserves old subject filters and adds declared orientation/response/use/license IDs without aliases',()=>{
  const filters={...EMPTY_CATALOG_FILTERS,subject:'mathematics',orientation:'orientation:ACT',response:'response:self',use:'use:research',license:'license:noncommercial_only'}
  expect(new URLSearchParams(catalogQuery(3,filters)).get('tags')).toBe('mathematics,orientation:ACT,response:self,use:research,license:noncommercial_only')
 })
})
