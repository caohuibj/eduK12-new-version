import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/parental_stress_pss18_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'
const pkg=projectScalePackage(source)!,d=pkg.definition
const id=(n:number)=>'PSS18_'+String(n).padStart(2,'0')
const all=(value:string)=>Array.from({length:18},(_,i)=>({itemCode:id(i+1),responseValue:value}))
const reverse=[1,2,5,6,7,8,17,18]
describe('Berry and Jones Parental Stress Scale PSS18 independent Chinese DRAFT (NOTRUN)',()=>{
 it('retains precisely 18 questions with CORC five agreement anchors',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(pkg.releaseStatus).toBe('DRAFT')
  expect(source.catalog.catalogStatus).toBe('CANDIDATE')
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:18},(_,i)=>id(i+1)))
  expect(d.responseSets[0].options.map(x=>x.label)).toEqual(['非常不同意','不同意','不确定','同意','非常同意'])
  expect(d.display.randomizeItems).toBe(false)
 })
 it('reverses only CORC 1,2,5,6,7,8,17,18 and sums 18–90',()=>{
  expect(d.scoring.itemRules.filter(x=>x.transform.type==='reverse').map(x=>x.itemCode)).toEqual(reverse.map(id))
  expect(d.scoring.scores).toHaveLength(1)
  expect(d.scoring.scores[0]).toMatchObject({key:'total',type:'total',canonical:true,missingPolicy:{type:'complete_required'},source:{type:'items',aggregation:'sum'}})
  expect(scoreScale(d,all('1')).scores[0].value).toBe(50)
  expect(scoreScale(d,all('5')).scores[0].value).toBe(58)
  expect(d.referencePolicy).toEqual({type:'none'})
 })
 it('matches 10 independent synthetic arithmetic cases, including mixed/reversed extremes and missing',()=>{
  for(const fx of pkg.goldenCases){
   const result=scoreScale(d,fx.answers)
   expect(result.quality.status).toBe(fx.expected.quality)
   expect(result.scores.map(s=>s.key)).toEqual(fx.expected.totalScoreKeys)
   expect(Object.fromEntries(result.scores.map(s=>[s.key,s.value]))).toEqual(fx.expected.scores)
  }
  const vals=(reversed:string,straight:string)=>Array.from({length:18},(_,i)=>({itemCode:id(i+1),responseValue:reverse.includes(i+1)?reversed:straight}))
  expect(scoreScale(d,vals('5','1')).scores[0].value).toBe(18)
  expect(scoreScale(d,vals('1','5')).scores[0].value).toBe(90)
 })
 it('restricts to parent/carer respondent, not Cohen Perceived Stress or child self',()=>{
  expect(source.catalog.identity.instrumentFamily).toContain('NOT Perceived Stress Scale')
  expect(source.applicability?.respondentTypes).toEqual(['PARENT'])
  const evaluate=(t:'PARENT'|'SELF',ageMonths?:number)=>evaluateInstrumentEligibility(source.applicability!,{respondentType:t,subject:ageMonths===undefined?undefined:{ageMonths},availableContextKeys:[]})
  expect(evaluate('PARENT',36).outcome).toBe('ELIGIBLE')
  expect(evaluate('PARENT',180).outcome).toBe('ELIGIBLE')
  expect(evaluate('SELF',36).outcome).toBe('INELIGIBLE')
 })
 it('records digital-integration permission as pending and does not invent clinical tiers',()=>{
  expect(d.license).toMatchObject({status:'unknown',redistribution:'restricted'})
  expect(source.catalog.construct.constructOverlapTags).toContain('license:electronic_integration_permission_required')
  expect(source.localization?.reviewStatus).toBe('PENDING')
  expect(d.report.interpretations).toHaveLength(1)
  expect(d.report.interpretations[0].source).toEqual({type:'score_only'})
  expect(d.report.interpretations[0].bands).toHaveLength(0)
 })
 it('rejects invalid answers and duplicates',()=>{
  for(const wrong of ['0','6','oops',3,3.5,Number.NaN])expect(()=>scoreScale(d,[{itemCode:id(1),responseValue:wrong},...all('3').slice(1)])).toThrow('量表回答不合法')
  expect(()=>scoreScale(d,[...all('3'),{itemCode:id(1),responseValue:'3'}])).toThrow('量表回答不合法')
 })
})
