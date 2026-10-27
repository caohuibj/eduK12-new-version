import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/dbt_wccl59_zh_cn_research/1.0.0/instrument'
import { SCALE_INSTRUMENT_SOURCE as traditional } from '../../../modules/scale/instruments/dbt_wccl59_zh_tw_official_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
const pkg=projectScalePackage(source)!,d=pkg.definition
const traditionalPkg=projectScalePackage(traditional)!,td=traditionalPkg.definition
const id=(n:number)=>'DBTWC'+String(n).padStart(2,'0')
const answer=(v:string)=>Array.from({length:59},(_,i)=>({itemCode:id(i+1),responseValue:v}))
describe('DBT-WCCL 59 independent Simplified Chinese wording draft (NOTRUN)',()=>{
 it('keeps DRAFT and the independent zh-CN content locale',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(source.executable?.releaseStatus).toBe('DRAFT')
  expect(source.executable?.contentLocale).toBe('zh-CN')
  expect(source.localization?.targetLocale).toBe('zh-CN')
  expect(d.items).toHaveLength(59)
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:59},(_,i)=>id(i+1)))
  expect(d.items[36].content).toContain('吃东西、喝酒、吸烟')
  expect(d.responseSets[0].options.map(x=>x.score)).toEqual([0,1,2,3])
 })
 it('preserves official TW item identities, score keys and golden mathematical expectations',()=>{
  expect(d.items.map(x=>x.itemCode)).toEqual(td.items.map(x=>x.itemCode))
  expect(d.scoring).toEqual(td.scoring)
  expect(d.scoring.scores.map(x=>x.key)).toEqual(['dss','dcs1','dcs2'])
  expect(d.scoring.scores.map(x=>x.source.items.length)).toEqual([38,15,6])
  expect(d.scoring.scores.every(x=>x.source.aggregation==='mean')).toBe(true)
  expect(d.scoring.itemRules.every(x=>x.transform.type==='identity')).toBe(true)
  expect(pkg.goldenCases).toEqual(traditionalPkg.goldenCases)
  expect(scoreScale(d,answer('0')).scores.map(x=>x.value)).toEqual([0,0,0])
  expect(scoreScale(d,answer('3')).scores.map(x=>x.value)).toEqual([3,3,3])
  expect(d.referencePolicy).toEqual({type:'none'})
 })
 it('matches all 12 synthetic golden cases including missingness',()=>{
  for(const fx of pkg.goldenCases){
   const result=scoreScale(d,fx.answers)
   expect(result.quality.status).toBe(fx.expected.quality)
   expect(Object.fromEntries(result.scores.map(x=>[x.key,x.value]))).toEqual(fx.expected.scores)
  }
 })
 it('flags rights and local scientific validation as pending',()=>{
  expect(source.localization?.reviewStatus).toBe('PENDING')
  expect(d.license).toMatchObject({status:'unknown',redistribution:'restricted'})
  expect(source.catalog.construct.constructOverlapTags).toContain('language_validation:content_zh-CN_working')
  expect(d.report.interpretations).toHaveLength(3)
  expect(d.report.interpretations.every(x=>x.source.type==='score_only'&&x.bands.length===0)).toBe(true)
 })
})
