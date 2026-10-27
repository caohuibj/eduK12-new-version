import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry',()=>({getScaleInstrumentSource:()=>undefined}))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/tes12_general_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { validateScaleDefinition } from '../../../modules/scale/scale-definition'
import { scoreScale } from '../../../modules/scale/scale-scoring'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'
const pkg=projectScalePackage(source)!,d=pkg.definition
const id=(n:number)=>'TESG_'+String(n).padStart(2,'0')
const all=(value:string)=>Array.from({length:12},(_,i)=>({itemCode:id(i+1),responseValue:value}))
describe('Frenzel TES12 General 2016 source-only independent zh-CN DRAFT (NOTRUN)',()=>{
 it('keeps original general 12 items with four forced-choice response labels',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(pkg.releaseStatus).toBe('DRAFT')
  expect(source.catalog.catalogStatus).toBe('CANDIDATE')
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:12},(_,i)=>id(i+1)))
  expect(d.responseSets[0].options.map(x=>x.label)).toEqual(['非常不同意','不同意','同意','非常同意'])
  expect(d.items[0].content).toContain('一般')
 })
 it('holds author recommended random display while recording current publish gate',()=>{
  expect(source.catalog.administration.itemOrderLocked).toBe(false)
  expect(d.display.randomizeItems).toBe(true)
  const draft=validateScaleDefinition(d,{instrumentClass:'STANDARD',forPublish:false})
  expect(draft.issues.filter(i=>i.severity==='error')).toEqual([])
  const forPublish=validateScaleDefinition(d,{instrumentClass:'STANDARD',forPublish:true})
  expect(forPublish.issues.some(i=>i.path==='display.randomizeItems'&&i.severity==='error')).toBe(true)
 })
 it('scores separate enjoyment/anger/anxiety four-item means and never reverses',()=>{
  expect(d.scoring.scores.map(x=>x.key)).toEqual(['enjoyment','anger','anxiety'])
  expect(d.scoring.itemRules.every(x=>x.transform.type==='identity')).toBe(true)
  for(const [i,s] of d.scoring.scores.entries()){
   if(s.source.type!=='items')throw new Error('requires direct item means')
   expect(s.source.aggregation).toBe('mean')
   expect(s.source.items.map(x=>x.itemCode)).toEqual(Array.from({length:4},(_,j)=>id(4*i+j+1)))
  }
  expect(scoreScale(d,all('1')).scores.map(x=>x.value)).toEqual([1,1,1])
  expect(scoreScale(d,all('4')).scores.map(x=>x.value)).toEqual([4,4,4])
  expect(d.referencePolicy).toEqual({type:'none'})
 })
 it('compares all ten authored synthetic golden cases incl. missing facet',()=>{
  for(const c of pkg.goldenCases){const out=scoreScale(d,c.answers);expect(out.quality.status).toBe(c.expected.quality);expect(Object.fromEntries(out.scores.map(s=>[s.key,s.value]))).toEqual(c.expected.scores)}
 })
 it('retains permission and Chinese human-review uncertainty; no clinical bands',()=>{
  expect(d.license).toMatchObject({status:'unknown',redistribution:'restricted'})
  expect(source.catalog.construct.constructOverlapTags).toContain('license:author_contact_required')
  expect(source.localization?.reviewStatus).toBe('PENDING')
  expect(d.report.interpretations).toHaveLength(3)
  expect(d.report.interpretations.every(x=>x.source.type==='score_only'&&x.bands.length===0)).toBe(true)
 })
 it('rejects invalid responses and underage policy; teacher role requires future product binding',()=>{
  for(const bad of ['0','5','bad',2,2.5,Number.NaN])expect(()=>scoreScale(d,[{itemCode:id(1),responseValue:bad},...all('2').slice(1)])).toThrow('量表回答不合法')
  const age=(months?:number)=>evaluateInstrumentEligibility(source.applicability!,{respondentType:'SELF',subject:months===undefined?undefined:{ageMonths:months},availableContextKeys:[]})
  expect(age(215).outcome).toBe('INELIGIBLE')
  expect(age(216).outcome).toBe('ELIGIBLE')
  expect(age(undefined).outcome).not.toBe('ELIGIBLE')
 })
})
