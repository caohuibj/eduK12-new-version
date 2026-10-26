import {describe,expect,it} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {catalogClassificationTags,catalogTagFacets,matchesCatalogDiscovery} from '../../modules/scale/library/catalog-discovery'
import {buildUnifiedScaleLibraryReadModel,filterUnifiedScaleLibraryEntries} from '../../modules/scale/library/catalog-only-read-model'
const ids=['domain:resilience','construct:self_perceived_psychological_resilience','orientation:ACT','population:adult','response:self','use:research','license:cc_by_nc_4_0','language_validation:working_translation']
const tags=()=>catalogClassificationTags({constructOverlapTags:ids})
describe('eight source-declared discovery axes, independent of permission',()=>{
 it('threads the eight namespaces without changing IDs or inventing mappings',()=>{
  const result=tags()
  expect(result.map(t=>t.id)).toEqual(ids)
  expect(new Set(result.map(t=>t.facet))).toEqual(new Set(['domain','construct','orientation','population','response','use','license','language']))
  const facets=catalogTagFacets([result,result])
  for(const tag of result)expect(facets[tag.facet as keyof typeof facets]).toEqual([{id:tag.id,label:tag.label}])
  // No proposed parent/alias relation creates an ACT tag for an untagged tool.
  expect(catalogClassificationTags({constructOverlapTags:['construct:personal_burnout']})).not.toEqual(expect.arrayContaining([expect.objectContaining({id:'orientation:ACT'})]))
 })
 it('finds a Chinese non-commercial label from an explicit source ID, with AND semantics and unknown IDs closed',()=>{
  expect(matchesCatalogDiscovery(['无关标题'],tags(),{keyword:'非商业'})).toBe(true)
  expect(matchesCatalogDiscovery(['无关标题'],tags(),{tags:ids})).toBe(true)
  expect(matchesCatalogDiscovery(['无关标题'],tags(),{tags:['license:cc_by_nc_4_0','orientation:unknown']})).toBe(false)
  for(const id of ['非商业','non_commercial','license:noncommercial_only'])expect(catalogClassificationTags({constructOverlapTags:[id]})[0]).toMatchObject({id,facet:'license',label:expect.stringContaining('非商业')})
 })
 it('keeps unknown source tags visible and does not promote them to a reviewed meaning',()=>{
  expect(catalogClassificationTags({constructOverlapTags:['orientation:unknown_model','novel:permission_approved']})).toEqual([{id:'orientation:unknown_model',label:'orientation:unknown_model',facet:'orientation'},{id:'novel:permission_approved',label:'novel:permission_approved',facet:'other'}])
 })
 it('adds no permission and changes no version/availability facts when the general library is filtered',()=>{
  const model=buildUnifiedScaleLibraryReadModel({viewerRole:'ADMIN',locale:'zh-CN',territory:'CN'})
  const entry=structuredClone(model.entries[0]);entry.construct.constructOverlapTags=[...ids]
  const before=canonicalHash(entry)
  const list=filterUnifiedScaleLibraryEntries([entry],{keyword:'非商业',tags:['orientation:ACT','license:cc_by_nc_4_0']})
  expect(list).toHaveLength(1)
  expect(list[0].availability).toEqual(entry.availability)
  expect(canonicalHash(entry)).toBe(before)
 })
})
