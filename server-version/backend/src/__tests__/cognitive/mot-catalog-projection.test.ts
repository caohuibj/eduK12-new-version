import {describe,it,expect} from 'vitest'
import {catalogTagFacets,matchesCatalogDiscovery} from '../../modules/scale/library/catalog-discovery'
import {motCatalogTags,motCatalogSearchText,motCatalogIntegration} from '../../modules/cognitive/content-candidates/mot/catalog'
import {motContent} from '../../modules/cognitive/content-candidates/mot/metadata'

describe('MOT projection into PR356 shared discovery contract',()=>{
 it('keeps stable cognitive IDs and multiscenario unknown suitability without assigning age or ability',()=>{
  const tags=motCatalogTags()
  expect(new Set(tags.map(t=>t.id)).size).toBe(tags.length)
  expect(tags.find(t=>t.id==='attention')?.facet).toBe('domain')
  expect(tags.find(t=>t.id==='recruitment_support')?.label).toContain('待验证')
  expect(tags.find(t=>t.id==='age_applicability:unverified')).toBeDefined()
  expect(tags.some(t=>/^age:\d/.test(t.id))).toBe(false)
  expect(motContent.tags.age.min).toBeNull();expect(motContent.tags.age.max).toBeNull()
  expect(motCatalogIntegration.globalSearchConnected).toBe(false)
 })
 it('uses the existing server AND matcher for Chinese/English keywords and exact IDs',()=>{
  const tags=motCatalogTags()
  expect(matchesCatalogDiscovery(motCatalogSearchText,tags,{keyword:'注意 招聘 待验证',tags:['attention','recruitment_support']})).toBe(true)
  expect(matchesCatalogDiscovery(motCatalogSearchText,tags,{keyword:'attention recruitment',tags:['touch','language:en']})).toBe(true)
  expect(matchesCatalogDiscovery(motCatalogSearchText,tags,{tags:['attention','unregistered_tag']})).toBe(false)
  expect(matchesCatalogDiscovery(motCatalogSearchText,tags,{keyword:'validated diagnosis'})).toBe(false)
 })
 it('projects supported shared facets and preserves unrepresented dimensions as pending',()=>{
  const facets=catalogTagFacets([motCatalogTags()])
  expect(facets.domain.map(t=>t.id)).toContain('attention')
  expect(facets.use.map(t=>t.id)).toContain('learning_evaluation_support')
  expect(facets.population.map(t=>t.id)).toContain('age_applicability:unverified')
  expect(Object.values(facets).flat().some(t=>t.id==='difficulty:unverified')).toBe(false)
  expect(motCatalogIntegration.pendingFacetConsumers).toContain('difficulty')
 })
})
