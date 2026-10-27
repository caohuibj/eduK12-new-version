import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/dbt_wccl59_zh_tw_official_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
const pkg=projectScalePackage(source)!,d=pkg.definition
const id=(n:number)=>'DBTWC'+String(n).padStart(2,'0')
const all=(v:string)=>Array.from({length:59},(_,i)=>({itemCode:id(i+1),responseValue:v}))
const facets={"dss":[1,2,4,6,9,10,11,13,16,18,19,21,22,23,26,27,29,31,33,34,35,36,38,39,40,42,43,44,47,49,50,51,53,54,56,57,58,59],"dcs1":[3,5,8,12,14,17,20,25,32,37,41,45,46,52,55],"dcs2":[7,15,24,28,30,48]}
describe('DBT-WCCL 59 official UW Traditional Chinese DRAFT (NOTRUN)',()=>{
 it('validates source, author Mandarin-script form, item order and 0-3 anchors',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(source.executable?.releaseStatus).toBe('DRAFT')
  expect(source.executable?.contentLocale).toBe('zh-TW')
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:59},(_,i)=>id(i+1)))
  expect(d.responseSets[0].options.map(x=>x.score)).toEqual([0,1,2,3])
  expect(d.items[36].content).toContain('進食、飲酒、吸煙')
 })
 it('scores author three independent 0-3 MEANS and no clinical total',()=>{
  expect(d.scoring.scores.map(x=>x.key)).toEqual(['dss','dcs1','dcs2'])
  expect(d.scoring.itemRules.every(r=>r.transform.type==='identity')).toBe(true)
  for(const [i,s] of d.scoring.scores.entries()){
   if(s.source.type!=='items')throw new Error('item source required')
   expect(s.source.aggregation).toBe('mean')
   expect(s.source.items.map(x=>x.itemCode)).toEqual(Object.values(facets)[i].map(id))
   expect(s.missingPolicy).toEqual({type:'complete_required'})
  }
  expect(scoreScale(d,all('0')).scores.map(x=>x.value)).toEqual([0,0,0])
  expect(scoreScale(d,all('3')).scores.map(x=>x.value)).toEqual([3,3,3])
  expect(d.referencePolicy).toEqual({type:'none'})
 })
 it('matches 12 synthetic golden cases including partial missing',()=>{
  for(const fx of pkg.goldenCases){
   const out=scoreScale(d,fx.answers)
   expect(out.quality.status).toBe(fx.expected.quality)
   expect(Object.fromEntries(out.scores.map(x=>[x.key,x.value]))).toEqual(fx.expected.scores)
  }
 })
 it('keeps adult-only and review-pending rights with no invented bands',()=>{
  expect(source.localization?.reviewStatus).toBe('PENDING')
  expect(d.license).toMatchObject({status:'unknown',redistribution:'restricted'})
  expect(source.catalog.construct.constructOverlapTags).toContain('license:commercial_forbidden')
  expect(d.report.interpretations).toHaveLength(3)
  expect(d.report.interpretations.every(x=>x.source.type==='score_only'&&x.bands.length===0)).toBe(true)
 })
 it('rejects invalid 0–3 values and duplicates',()=>{
  for(const bad of ['-1','4','bad',2,2.5,Number.NaN])expect(()=>scoreScale(d,[{itemCode:id(1),responseValue:bad},...all('2').slice(1)])).toThrow('量表回答不合法')
  expect(()=>scoreScale(d,[...all('2'),{itemCode:id(1),responseValue:'2'}])).toThrow('量表回答不合法')
 })
})
