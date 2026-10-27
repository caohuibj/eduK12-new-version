import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/prfq18_parent_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'
const pkg=projectScalePackage(source)!,d=pkg.definition
const id=(n:number)=>'PRFQ18_'+String(n).padStart(2,'0')
const all=(v:string)=>Array.from({length:18},(_,i)=>({itemCode:id(i+1),responseValue:v}))
const groups={prementalizing:[1,4,7,10,13,16],certainty:[2,5,8,11,14,17],curiosity:[3,6,9,12,15,18]}
describe('PRFQ-18 Luyten child0–5 Chinese DRAFT (tests NOTRUN in content phase)',()=>{
 it('keeps fixed author ordering, 18 items and only original labels 1/4/7',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(pkg.releaseStatus).toBe('DRAFT')
  expect(source.catalog.catalogStatus).toBe('CANDIDATE')
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:18},(_,i)=>id(i+1)))
  expect(d.responseSets[0].options.map(x=>x.label)).toEqual(['非常不同意','2','3','中立','5','6','非常同意'])
  expect(d.display.randomizeItems).toBe(false)
 })
 it('keeps three original six-item means, reverses ONLY 11 and 18, without a total',()=>{
  expect(d.scoring.scores.map(x=>x.key)).toEqual(Object.keys(groups))
  for(const s of d.scoring.scores){
   expect(s.type).toBe('dimension')
   if(s.source.type!=='items')throw new Error('requires item source')
   expect(s.source.aggregation).toBe('mean')
   expect(s.source.items.map(x=>x.itemCode)).toEqual(groups[s.key as keyof typeof groups].map(id))
  }
  expect(d.scoring.itemRules.filter(x=>x.transform.type==='reverse').map(x=>x.itemCode)).toEqual([11,18].map(id))
  expect(scoreScale(d,all('4')).scores.map(s=>s.value)).toEqual([4,4,4])
  expect(d.referencePolicy).toEqual({type:'none'})
 })
 it('retains 12 synthetic score vectors incl. two reverse extremes and partial facets',()=>{
  for(const v of pkg.goldenCases){
   const result=scoreScale(d,v.answers)
   expect(result.quality.status).toBe(v.expected.quality)
   expect(result.scores.map(x=>x.key)).toEqual(v.expected.totalScoreKeys)
   expect(Object.fromEntries(result.scores.map(x=>[x.key,x.value]))).toEqual(v.expected.scores)
  }
 })
 it('enforces parent-role and child's 0–5 age instead of treating parent as child',()=>{
  const policy=(childMonths?:number,respondentType:'PARENT'|'SELF'='PARENT')=>evaluateInstrumentEligibility(source.applicability!,{respondentType,subject:childMonths===undefined?undefined:{ageMonths:childMonths},availableContextKeys:[]})
  expect(policy(0).outcome).toBe('ELIGIBLE')
  expect(policy(71).outcome).toBe('ELIGIBLE')
  expect(policy(72).outcome).toBe('INELIGIBLE')
  expect(policy(undefined).outcome).not.toBe('ELIGIBLE')
  expect(policy(48,'SELF').outcome).toBe('INELIGIBLE')
 })
 it('keeps author-contact and score-only nonclinical Chinese-review caveat',()=>{
  expect(d.license).toMatchObject({status:'unknown',redistribution:'restricted'})
  expect(source.localization?.reviewStatus).toBe('PENDING')
  expect(source.catalog.construct.constructOverlapTags).toContain('license:written_translation_permission_required')
  expect(d.report.interpretations).toHaveLength(3)
  expect(d.report.interpretations.every(x=>x.source.type==='score_only'&&x.bands.length===0)).toBe(true)
 })
 it('refuses wrong type, outside range or repeated answers',()=>{
  for(const value of ['0','8','bad',3,3.5,Number.NaN]) expect(()=>scoreScale(d,[{itemCode:id(1),responseValue:value},...all('4').slice(1)])).toThrow('量表回答不合法')
  expect(()=>scoreScale(d,[...all('4'),{itemCode:id(1),responseValue:'4'}])).toThrow('量表回答不合法')
 })
})
