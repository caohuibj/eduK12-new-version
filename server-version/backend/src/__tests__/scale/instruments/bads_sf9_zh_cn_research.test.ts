import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/bads_sf9_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
const pkg=projectScalePackage(source)!,d=pkg.definition
const id=(i:number)=>'BADS_SF9_'+String(i).padStart(2,'0')
const all=(v:string)=>Array.from({length:9},(_,i)=>({itemCode:id(i+1),responseValue:v}))
describe('BADS-SF9 independent Chinese DRAFT (prepared; NOTRUN)',()=>{
 it('retains exact 9 items, past week, original numeric anchors and DRAFT status',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(source.executable?.releaseStatus).toBe('DRAFT')
  expect(source.instruction?.text).toContain('过去一周')
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:9},(_,i)=>id(i+1)))
  expect(d.responseSets[0].options.map(x=>x.score)).toEqual([0,1,2,3,4,5,6])
  expect(d.responseSets[0].options.map(x=>x.label)).toEqual(['完全不符合','1','稍微符合','3','相当符合','5','完全符合'])
 })
 it('reverses only items 1/6/7/8 and has total score only',()=>{
  expect(d.scoring.itemRules.filter(x=>x.transform.type==='reverse').map(x=>x.itemCode)).toEqual([1,6,7,8].map(id))
  expect(d.scoring.scores.map(x=>x.key)).toEqual(['total'])
  expect(d.scoring.scores[0].source).toMatchObject({type:'items',aggregation:'sum'})
  expect(scoreScale(d,all('0')).scores[0].value).toBe(24)
  expect(scoreScale(d,all('6')).scores[0].value).toBe(30)
  expect(d.referencePolicy).toEqual({type:'none'})
 })
 it('matches synthetic 10-case arithmetic including extremes/missingness',()=>{
  for(const fx of pkg.goldenCases){
   const v=scoreScale(d,fx.answers)
   expect(v.quality.status).toBe(fx.expected.quality)
   expect(Object.fromEntries(v.scores.map(x=>[x.key,x.value]))).toEqual(fx.expected.scores)
  }
 })
 it('keeps single report, not two weak short-form subscales or clinical thresholds',()=>{
  expect(d.report.primaryScoreKeys).toEqual(['total'])
  expect(d.report.interpretations[0].source).toEqual({type:'score_only'})
  expect(d.report.interpretations[0].bands).toHaveLength(0)
  expect(d.license).toMatchObject({status:'unknown',redistribution:'restricted'})
  expect(source.localization?.reviewStatus).toBe('PENDING')
 })
 it('rejects invalid/duplicate response inputs',()=>{
  for(const v of ['7','-1','x',2,2.5,Number.NaN])expect(()=>scoreScale(d,[{itemCode:id(1),responseValue:v},...all('3').slice(1)])).toThrow('量表回答不合法')
  expect(()=>scoreScale(d,[...all('3'),{itemCode:id(1),responseValue:'3'}])).toThrow('量表回答不合法')
 })
})
