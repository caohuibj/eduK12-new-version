import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry',()=>({getScaleInstrumentSource:()=>undefined}))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/mspss12_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'
const pkg=projectScalePackage(source)!,d=pkg.definition
const id=(n:number)=>'MSPSS12_'+String(n).padStart(2,'0')
const all=(value:string)=>Array.from({length:12},(_,i)=>({itemCode:id(i+1),responseValue:value}))
describe('MSPSS12 original seven-point Chinese independent DRAFT (tests not executed)',()=>{
 it('holds 12 source-ordered items, genuine 1-7 anchors and draft state',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(pkg.releaseStatus).toBe('DRAFT')
  expect(source.catalog.catalogStatus).toBe('CANDIDATE')
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:12},(_,i)=>id(i+1)))
  expect(d.responseSets[0].options.map(x=>x.score)).toEqual([1,2,3,4,5,6,7])
  expect(d.display.randomizeItems).toBe(false)
 })
 it('produces total and original three distinct four-item means, not Chinese five-point scoring',()=>{
  const mapping={total:[1,2,3,4,5,6,7,8,9,10,11,12],significant_other:[1,2,5,10],family:[3,4,8,11],friends:[6,7,9,12]}
  expect(d.scoring.scores.map(x=>x.key)).toEqual(Object.keys(mapping))
  for(const score of d.scoring.scores){
   if(score.source.type!=='items')throw new Error('expected item score')
   expect(score.source.aggregation).toBe('mean')
   expect(score.source.items.map(x=>x.itemCode)).toEqual(mapping[score.key as keyof typeof mapping].map(id))
  }
  expect(d.scoring.itemRules.every(x=>x.transform.type==='identity')).toBe(true)
  expect(scoreScale(d,all('1')).scores.map(x=>x.value)).toEqual([1,1,1,1])
  expect(scoreScale(d,all('7')).scores.map(x=>x.value)).toEqual([7,7,7,7])
  expect(d.referencePolicy).toEqual({type:'none'})
 })
 it('matches nine synthetic vectors and per-facet missing handling',()=>{
  for(const c of pkg.goldenCases){
   const result=scoreScale(d,c.answers)
   expect(result.quality.status).toBe(c.expected.quality)
   expect(Object.fromEntries(result.scores.map(x=>[x.key,x.value]))).toEqual(c.expected.scores)
  }
 })
 it('keeps eight axes, license uncertainty, individual non-diagnostic score-only reports',()=>{
  expect(source.catalog.construct.constructOverlapTags).toContain('license:author_contact_required')
  expect(d.license).toMatchObject({status:'unknown',redistribution:'restricted'})
  expect(source.localization?.reviewStatus).toBe('PENDING')
  expect(d.report.interpretations).toHaveLength(4)
  expect(d.report.interpretations.every(x=>x.source.type==='score_only'&&x.bands.length===0)).toBe(true)
 })
 it('rejects duplicate and invalid response formats and limits adult draft population',()=>{
  for(const bad of ['0','8','invalid',4,3.5,Number.NaN])expect(()=>scoreScale(d,[{itemCode:id(1),responseValue:bad},...all('4').slice(1)])).toThrow('量表回答不合法')
  expect(()=>scoreScale(d,[...all('4'),{itemCode:id(1),responseValue:'4'}])).toThrow('量表回答不合法')
  const age=(months?:number)=>evaluateInstrumentEligibility(source.applicability!,{respondentType:'SELF',subject:months===undefined?undefined:{ageMonths:months},availableContextKeys:[]})
  expect(age(215).outcome).toBe('INELIGIBLE')
  expect(age(216).outcome).toBe('ELIGIBLE')
  expect(age(undefined).outcome).not.toBe('ELIGIBLE')
 })
})
