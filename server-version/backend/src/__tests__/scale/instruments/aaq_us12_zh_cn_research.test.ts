import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/aaq_us12_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
const pkg=projectScalePackage(source)!,d=pkg.definition
const id=(n:number)=>'AAQ_US12_'+String(n).padStart(2,'0')
const answers=(value:string)=>Array.from({length:12},(_,i)=>({itemCode:id(i+1),responseValue:value}))
describe('Levin AAQ-US12 independent Chinese college research DRAFT (NOTRUN)',()=>{
 it('retains source author DOC administration sequence rather than journal table row numbers',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(source.executable?.releaseStatus).toBe('DRAFT')
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:12},(_,i)=>id(i+1)))
  expect(d.items[0].content).toContain('考试')
  expect(d.items[7].content).toContain('心情')
  expect(d.display.randomizeItems).toBe(false)
 })
 it('uses 7 true-frequency options and one original sum score without reversals',()=>{
  expect(d.responseSets[0].options.map(x=>x.score)).toEqual([1,2,3,4,5,6,7])
  expect(d.scoring.scores.map(x=>x.key)).toEqual(['total'])
  expect(d.scoring.itemRules.every(x=>x.transform.type==='identity')).toBe(true)
  expect(d.scoring.scores[0].source).toMatchObject({type:'items',aggregation:'sum'})
  expect(scoreScale(d,answers('1')).scores[0].value).toBe(12)
  expect(scoreScale(d,answers('7')).scores[0].value).toBe(84)
  expect(d.referencePolicy).toEqual({type:'none'})
 })
 it('matches ten authored synthetic golden vectors (including incomplete)',()=>{
  for(const c of pkg.goldenCases){
   const output=scoreScale(d,c.answers)
   expect(output.quality.status).toBe(c.expected.quality)
   expect(Object.fromEntries(output.scores.map(x=>[x.key,x.value]))).toEqual(c.expected.scores)
  }
 })
 it('states unvalidated Chinese status and unverified redistribution, without cutoffs',()=>{
  expect(source.localization?.reviewStatus).toBe('PENDING')
  expect(d.license).toMatchObject({status:'unknown',redistribution:'restricted'})
  expect(source.catalog.construct.constructOverlapTags).toContain('license:third_party_ccby_claim_unverified')
  expect(d.report.interpretations).toHaveLength(1)
  expect(d.report.interpretations[0].bands).toHaveLength(0)
  expect(d.report.interpretations[0].source).toEqual({type:'score_only'})
 })
 it('rejects wrong response encodings and duplicate answers',()=>{
  for(const wrong of ['0','8','bogus',3,3.5,Number.NaN])expect(()=>scoreScale(d,[{itemCode:id(1),responseValue:wrong},...answers('4').slice(1)])).toThrow('量表回答不合法')
  expect(()=>scoreScale(d,[...answers('4'),{itemCode:id(1),responseValue:'4'}])).toThrow('量表回答不合法')
 })
})
