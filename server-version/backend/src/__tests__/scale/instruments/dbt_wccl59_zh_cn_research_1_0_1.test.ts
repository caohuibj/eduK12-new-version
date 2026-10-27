import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/dbt_wccl59_zh_cn_research/1.0.1/instrument'
import { SCALE_INSTRUMENT_SOURCE as previous } from '../../../modules/scale/instruments/dbt_wccl59_zh_cn_research/1.0.0/instrument'
import { projectScalePackage, defineScaleInstrumentSource } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
const pkg=projectScalePackage(source)!,oldPkg=projectScalePackage(previous)!,d=pkg.definition
const id=(n:number)=>'DBTWC'+String(n).padStart(2,'0')
describe('DBT-WCCL59 direct UW English→zh-CN translation 1.0.1 (NOTRUN)',()=>{
 it('locks direct EN origin, 59 original item IDs and response anchors',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(source.identity.instrumentVersion).toBe('1.0.1')
  expect(source.executable.releaseStatus).toBe('DRAFT')
  expect(source.localization.sourceLocale).toBe('en')
  expect(source.localization.targetLocale).toBe('zh-CN')
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:59},(_,i)=>id(i+1)))
  expect(d.responseSets[0].options.map(x=>x.score)).toEqual([0,1,2,3])
  expect(d.items[1].content).toContain('值得庆幸')
  expect(d.items[5].content).toContain('疏远')
  expect(d.items[56].content).toContain('作比较')
 })
 it('does not change version 1.0.0 scoring or original synthetic golden data',()=>{
  expect(d.scoring).toEqual(oldPkg.definition.scoring)
  expect(pkg.goldenCases).toEqual(oldPkg.goldenCases)
  expect(d.scoring.scores.map(x=>x.key)).toEqual(['dss','dcs1','dcs2'])
  expect(d.scoring.scores.map(x=>x.source.items.length)).toEqual([38,15,6])
  expect(d.scoring.scores.every(x=>x.source.aggregation==='mean')).toBe(true)
  expect(d.scoring.itemRules.every(x=>x.transform.type==='identity')).toBe(true)
  expect(d.referencePolicy).toEqual({type:'none'})
 })
 it('checks the 12 unchanged mathematical golden cases',()=>{
  for(const fx of pkg.goldenCases){
   const scored=scoreScale(d,fx.answers)
   expect(scored.quality.status).toBe(fx.expected.quality)
   expect(Object.fromEntries(scored.scores.map(x=>[x.key,x.value]))).toEqual(fx.expected.scores)
  }
 })
 it('keeps provisional localization, rights and no fake severity bands',()=>{
  expect(source.localization.reviewStatus).toBe('PENDING')
  expect(d.license).toMatchObject({status:'unknown',redistribution:'restricted'})
  expect(source.catalog.construct.constructOverlapTags).toContain('language_validation:direct_translation_en_to_zh-CN')
  expect(d.report.interpretations.every(x=>x.bands.length===0)).toBe(true)
 })
})
