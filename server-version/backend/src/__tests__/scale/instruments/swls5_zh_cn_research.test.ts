import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/swls5_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'
const pkg=projectScalePackage(source)!, d=pkg.definition
const id=(n:number)=>'SWLS5_'+String(n).padStart(2,'0')
const all=(v:string)=>Array.from({length:5},(_,i)=>({itemCode:id(i+1),responseValue:v}))

describe('SWLS-5 independent Chinese DRAFT (tests authored; not executed during content preparation)',()=>{
 it('keeps original five-item order, independent instruction and 7-point agreement choices',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(source.executable?.releaseStatus).toBe('DRAFT')
  expect(source.catalog.catalogStatus).toBe('CANDIDATE')
  expect(d.items.map(x=>x.itemCode)).toEqual([1,2,3,4,5].map(id))
  expect(d.responseSets[0].options.map(x=>x.score)).toEqual([1,2,3,4,5,6,7])
  expect(d.responseSets[0].options[3].label).toBe('既不赞同也不反对')
  expect(source.instruction?.version).toBe('1.0.0')
 })
 it('scores one sum 5–35 without reversal, extra subscales or norms',()=>{
  expect(d.scoring.itemRules.every(x=>x.transform.type==='identity')).toBe(true)
  expect(d.scoring.scores).toHaveLength(1)
  expect(d.scoring.scores[0]).toMatchObject({key:'total',type:'total',canonical:true,source:{type:'items',aggregation:'sum'},missingPolicy:{type:'complete_required'}})
  expect(scoreScale(d,all('1')).scores[0].value).toBe(5)
  expect(scoreScale(d,all('7')).scores[0].value).toBe(35)
  expect(d.referencePolicy).toEqual({type:'none'})
  expect(d.report.interpretations[0].bands).toEqual([])
 })
 it('checks all six synthetic golden cases and null on missing data',()=>{
  for(const f of pkg.goldenCases){const actual=scoreScale(d,f.answers);expect(actual.quality.status).toBe(f.expected.quality);expect(Object.fromEntries(actual.scores.map(s=>[s.key,s.value]))).toEqual(f.expected.scores)}
 })
 it('rejects invalid or duplicate response values',()=>{
  for(const wrong of ['0','8','oops',3,2.5,Number.NaN])expect(()=>scoreScale(d,[{itemCode:id(1),responseValue:wrong},...all('4').slice(1)])).toThrow('量表回答不合法')
  expect(()=>scoreScale(d,[...all('4'),{itemCode:id(1),responseValue:'4'}])).toThrow('量表回答不合法')
 })
 it('retains adult self eligibility and noncommercial license caveat',()=>{
  const eligibility=(ageMonths?:number)=>evaluateInstrumentEligibility(source.applicability!,{respondentType:'SELF',subject:ageMonths===undefined?undefined:{ageMonths},availableContextKeys:[]})
  expect(eligibility(215).outcome).toBe('INELIGIBLE')
  expect(eligibility(216).outcome).toBe('ELIGIBLE')
  expect(eligibility(undefined).outcome).not.toBe('ELIGIBLE')
  expect(d.license).toMatchObject({status:'unknown',redistribution:'restricted'})
  expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL'])
  expect(source.catalog.construct.constructOverlapTags).toContain('license:author_contact_required')
 })
})
