import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/erq10_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'
const pkg=projectScalePackage(source)!, d=pkg.definition
const code=(n:number)=>'ERQ10_'+String(n).padStart(2,'0')
const all=(v:string)=>Array.from({length:10},(_,i)=>({itemCode:code(i+1),responseValue:v}))
describe('ERQ-10 independent adult Chinese DRAFT — supplied tests NOTRUN',()=>{
 it('keeps official original ten-item order, positive/negative examples and the 1/4/7 anchors',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(source.catalog.catalogStatus).toBe('CANDIDATE')
  expect(pkg.releaseStatus).toBe('DRAFT')
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:10},(_,i)=>code(i+1)))
  expect(d.items[0].content).toContain('例如')
  expect(d.items[2].content).toContain('悲伤')
  expect(d.responseSets[0].options.map(x=>x.label)).toEqual(['非常不同意','2','3','中立','5','6','非常同意'])
 })
 it('uses two independent 1–7 means, no reverse items and no overall total',()=>{
  expect(d.scoring.scores.map(x=>x.key)).toEqual(['reappraisal','suppression'])
  const a=d.scoring.scores[0], b=d.scoring.scores[1]
  if(a.source.type!=='items'||b.source.type!=='items')throw new Error('Expected direct item means')
  expect(a.source.items.map(x=>x.itemCode)).toEqual([1,3,5,7,8,10].map(code))
  expect(b.source.items.map(x=>x.itemCode)).toEqual([2,4,6,9].map(code))
  expect(a.source.aggregation).toBe('mean')
  expect(b.source.aggregation).toBe('mean')
  expect(d.scoring.itemRules.every(x=>x.transform.type==='identity')).toBe(true)
  expect(scoreScale(d,all('1')).scores.map(x=>x.value)).toEqual([1,1])
  expect(scoreScale(d,all('7')).scores.map(x=>x.value)).toEqual([7,7])
  expect(d.referencePolicy).toEqual({type:'none'})
 })
 it('retains 9 golden synthetic arithmetic cases including incomplete dimensions',()=>{
  for(const f of pkg.goldenCases){
   const actual=scoreScale(d,f.answers)
   expect(actual.quality.status).toBe(f.expected.quality)
   expect(Object.fromEntries(actual.scores.map(x=>[x.key,x.value]))).toEqual(f.expected.scores)
  }
 })
 it('preserves evidence/rights uncertainty and avoids fictional bands',()=>{
  expect(d.license).toMatchObject({status:'unknown',redistribution:'restricted'})
  expect(source.localization?.reviewStatus).toBe('PENDING')
  expect(source.catalog.construct.constructOverlapTags).toContain('license:author_contact_required')
  expect(d.report.interpretations).toHaveLength(2)
  expect(d.report.interpretations.every(x=>x.source.type==='score_only'&&x.bands.length===0)).toBe(true)
 })
 it('refuses malformed response and keeps adult-only draft policy',()=>{
  for(const wrong of ['0','8','bogus',3,3.5,Number.NaN])expect(()=>scoreScale(d,[{itemCode:code(1),responseValue:wrong},...all('4').slice(1)])).toThrow('量表回答不合法')
  const policy=(months?:number)=>evaluateInstrumentEligibility(source.applicability!,{respondentType:'SELF',subject:months===undefined?undefined:{ageMonths:months},availableContextKeys:[]})
  expect(policy(215).outcome).toBe('INELIGIBLE')
  expect(policy(216).outcome).toBe('ELIGIBLE')
  expect(policy(undefined).outcome).not.toBe('ELIGIBLE')
 })
})
