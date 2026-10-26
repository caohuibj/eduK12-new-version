import {describe,expect,it} from 'vitest'
import {catalogDiscoveryRecords,cognitiveClassificationTags,cognitiveDiscoveryWhere,scaleDiscoveryWhere} from '../../modules/survey/catalog-discovery'
import {catalogClassificationTags,scaleSourceClassificationTags} from '../../modules/scale/library/catalog-discovery'
import {getScaleInstrumentSource} from '../../modules/scale/onboarding/instrument-registry'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'

describe('shared declared catalog classification',()=>{
 it('uses actual language and population declarations without changing source identities',()=>{
  const source=getScaleInstrumentSource('value_cost_mathematics_zh_cn','1.0.0')!
  const before=canonicalHash(source.catalog),tags=scaleSourceClassificationTags(source)
  expect(tags).toContainEqual({id:'language:zh-CN',label:'简体中文',facet:'language'})
  expect(tags).toContainEqual({id:'respondent:SELF',label:'本人自评',facet:'population'})
  expect(tags.some(tag=>tag.id.startsWith('grades:'))).toBe(true)
  expect(canonicalHash(source.catalog)).toBe(before)
  expect(catalogClassificationTags({primaryDomain:'WELL_BEING'})).not.toContainEqual(expect.objectContaining({facet:'population'}))
 })
 it('derives cognitive ability labels from the exact evidence mapping and refuses inherited applicability',()=>{
  const tags=cognitiveClassificationTags('gonogo','1.0.0','1.0.0')
  expect(tags).toContainEqual({id:'cognitive-domain:response_inhibition',label:'反应抑制',facet:'domain'})
  expect(tags).toContainEqual({id:'cognitive-facet:response_inhibition/action_withholding',label:'动作克制',facet:'construct'})
  expect(tags.some(tag=>tag.facet==='population'||tag.facet==='language'||tag.facet==='subject')).toBe(false)
  expect(cognitiveClassificationTags('gonogo','99.0.0','1.0.0')).toEqual([])
 })
 it('makes unknown or rights-like tags an empty Prisma OR before skip/take rather than widening the query',()=>{
  const records=catalogDiscoveryRecords()
  expect(scaleDiscoveryWhere(records,{tags:['PUBLIC']})).toEqual({AND:[{OR:[]}]})
  expect(cognitiveDiscoveryWhere(records,{tags:['student_self_report']})).toEqual({AND:[{OR:[]}]})
  expect(cognitiveDiscoveryWhere(records,{tags:['cognitive-domain:working_memory']})).toMatchObject({AND:[{OR:expect.arrayContaining([{testType:'memory',engineVersion:'1.0.0',scoringVersion:'1.1.0'}])}]})
  expect(records.some(record=>record.key==='fake')).toBe(false)
 })
})
