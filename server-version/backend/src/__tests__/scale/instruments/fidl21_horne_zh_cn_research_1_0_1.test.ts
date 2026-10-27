import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/fidl21_horne_zh_cn_research/1.0.1/instrument'
import { SCALE_INSTRUMENT_SOURCE as catalogOnly } from '../../../modules/scale/instruments/fidl21_horne_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
const pkg=projectScalePackage(source)!,d=pkg.definition
const id=(n:number)=>'FIDL21_'+String(n).padStart(2,'0')
const dimensions={"repetition":[7,11,13,14,15,19],"switching":[3,6,16,18,20],"predictability_control":[2,4,17,21],"routine":[1,5,8],"thoughts_beliefs":[9,10,12]}
const reverse=[3,6,16,18,20]
const rawAll=(v:string)=>Array.from({length:21},(_,i)=>({itemCode:id(i+1),responseValue:v}))
describe('Horne FIDL-21 original author appendix, independently translated Chinese DRAFT (NOTRUN)',()=>{
 it('preserves previous catalog-only identity, correct 21 new item IDs and user-approved wording review',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(source.identity.instrumentVersion).toBe('1.0.1')
  expect(catalogOnly.executable).toBeUndefined()
  expect(source.executable?.releaseStatus).toBe('DRAFT')
  expect(source.catalog.catalogStatus).toBe('REVIEWED')
  expect(source.catalog.catalogManifestVersion).toBe(2)
  expect(source.localization).toMatchObject({sourceLocale:'en',targetLocale:'zh-CN',expertReviewStatus:'PENDING',reviewStatus:'APPROVED'})
  expect(source.localization?.reviewedAt).toBe('2026-10-27T09:09:27Z')
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:21},(_,i)=>id(i+1)))
  expect(d.responseSets[0].options.map(x=>x.score)).toEqual([1,2,3,4,5])
  expect(source.instruction?.text).toContain('过去两周')
 })
 it('matches official scoring page 12: exact five factors and five reverse keys',()=>{
  expect(d.scoring.scoringVersion).toBe('1.0.0')
  expect(d.scoring.scores.map(x=>x.key)).toEqual(['total',...Object.keys(dimensions)])
  expect(d.scoring.scores.map(x=>x.source.items.length)).toEqual([21,6,5,4,3,3])
  expect(d.scoring.scores.every(x=>x.source.aggregation==='sum')).toBe(true)
  expect(d.scoring.scores.slice(1).map(x=>x.source.items.map(v=>v.itemCode))).toEqual(Object.values(dimensions).map(g=>g.map(id)))
  expect(d.scoring.itemRules.filter(x=>x.transform.type==='reverse').map(x=>x.itemCode)).toEqual(reverse.map(id))
  expect(d.scoring.itemRules.every(x=>['identity','reverse'].includes(x.transform.type))).toBe(true)
  expect(d.referencePolicy).toEqual({type:'none'})
  expect(scoreScale(d,rawAll('1')).scores[0].value).toBe(41)
  expect(scoreScale(d,rawAll('5')).scores[0].value).toBe(85)
 })
 it('checks 11 mathematical golden cases: true bounds, factor specificity and missingness',()=>{
  expect(pkg.goldenCases).toHaveLength(11)
  for(const fixture of pkg.goldenCases){
   const result=scoreScale(d,fixture.answers)
   expect(result.quality.status).toBe(fixture.expected.quality)
   expect(Object.fromEntries(result.scores.map(x=>[x.key,x.value]))).toEqual(fixture.expected.scores)
  }
 })
 it('rejects malformed and duplicate answers',()=>{
  const valid=rawAll('3')
  for(const bad of ['0','6','invalid',1.5]){
   expect(()=>scoreScale(d,[{itemCode:id(1),responseValue:bad},...valid.slice(1)])).toThrow('量表回答不合法')
  }
  expect(()=>scoreScale(d,[...valid,{itemCode:id(1),responseValue:'3'}])).toThrow('量表回答不合法')
 })
 it('keeps PILOT/non-diagnostic research and unresolved licensing explicit',()=>{
  expect(source.catalog.scientificMaturity).toBe('PILOT')
  expect(d.report.interpretations).toHaveLength(6)
  expect(d.report.interpretations.every(x=>x.source.type==='score_only'&&x.bands.length===0)).toBe(true)
  expect(d.license).toMatchObject({status:'unknown',redistribution:'restricted'})
  expect(source.catalog.construct.constructOverlapTags).toContain('license:author_contact_required')
 })
})
