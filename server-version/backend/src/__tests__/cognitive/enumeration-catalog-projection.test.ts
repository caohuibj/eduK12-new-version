import { describe, expect, it } from 'vitest'
import { matchesCatalogDiscovery, catalogTagFacets } from '../../modules/scale/library/catalog-discovery'
import { enumerationCatalogTags, enumerationCatalogSearchText, enumerationCatalogIntegration } from '../../modules/cognitive/content-candidates/enumeration/catalog'
import { enumerationRecipeContent, enumerationContent } from '../../modules/cognitive/content-candidates/enumeration/metadata'

it('matches bilingual content with the existing AND semantics without claiming backend persistence', () => {
  const tags = enumerationCatalogTags()
  expect(matchesCatalogDiscovery(enumerationCatalogSearchText, tags,
    { keyword: '点数 学习 待验证', tags: ['attention', 'learning_evaluation_support'] })).toBe(true)
  expect(matchesCatalogDiscovery(enumerationCatalogSearchText, tags,
    { keyword: 'enumeration recruitment', tags: ['brief_numerosity_report', 'touch'] })).toBe(true)
  expect(matchesCatalogDiscovery(enumerationCatalogSearchText, tags,
    { tags: ['attention', 'dynamic_tracking'] })).toBe(false)
  expect(matchesCatalogDiscovery(enumerationCatalogSearchText, tags,
    { keyword: 'validated diagnosis' })).toBe(false)
  expect(enumerationCatalogIntegration.persisted).toBe(false)
  expect(enumerationCatalogIntegration.globalSearchConnected).toBe(false)
})
it('keeps unknown age/difficulty and restricted application labels in the supported shared facets', () => {
  const tags = enumerationCatalogTags(), facets = catalogTagFacets([tags])
  expect(new Set(tags.map(t => t.id)).size).toBe(tags.length)
  expect(facets.population.map(t => t.id)).toContain('age_applicability:unverified')
  expect(tags.some(t => /^age:\d/.test(t.id))).toBe(false)
  expect(tags.find(t => t.id === 'recruitment_support')?.label).toContain('非选拔预测')
  expect(tags.find(t => t.id === 'difficulty:unverified')?.label).toContain('未核')
  expect(Object.values(facets).flat().some(t => t.id === 'difficulty:unverified')).toBe(false)
  expect(enumerationRecipeContent.extensions.age).toEqual({ min: null, max: null, status: 'unverified' })
  expect(enumerationRecipeContent.implementation.runtimeImport).toBe('unverified')
  // The old null-recipe metadata remains a source snapshot, not relabelled as the new candidate.
  expect(enumerationContent.extensions.maturity).toBe('candidate_runner_unregistered')
})
