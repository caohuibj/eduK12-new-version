import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/ierq20_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'
const pkg=projectScalePackage(source)!,d=pkg.definition
const item=(n:number)=>'IERQ20_'+String(n).padStart(2,'0')
const answers=(value:string)=>Array.from({length:20},(_,i)=>({itemCode:item(i+1),responseValue:value}))

describe('IERQ-20 2016 Appendix I independent Chinese DRAFT (tests supplied, not executed in content phase)',()=>{
 it('retains the exact20-item order, five agreement labels and DRAFT status',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(source.identity).toEqual({instrumentKey:'ierq20_zh_cn_research',instrumentVersion:'1.0.0'})
  expect(pkg.releaseStatus).toBe('DRAFT')
  expect(source.catalog.catalogStatus).toBe('CANDIDATE')
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:20},(_,i)=>item(i+1)))
  expect(d.responseSets[0].options.map(x=>x.score)).toEqual([1,2,3,4,5])
  expect(d.display.randomizeItems).toBe(false)
 })
 it('maps the four original five-item keys with no reversed item and no global total',()=>{
  const keys={enhancing_positive_affect:[3,6,8,13,18],perspective_taking:[2,7,10,14,17],soothing:[4,9,12,16,19],social_modeling:[1,5,11,15,20]}
  expect(d.scoring.scores.map(x=>x.key)).toEqual(Object.keys(keys))
  for (const score of d.scoring.scores) {
   expect(score.type).toBe('dimension')
   expect(score.canonical).toBe(true)
   expect(score.missingPolicy).toEqual({type:'complete_required'})
   expect(score.source.type).toBe('items')
   if (score.source.type==='items') {
    expect(score.source.aggregation).toBe('sum')
    expect(score.source.items.map(x=>x.itemCode)).toEqual(keys[score.key as keyof typeof keys].map(item))
   }
  }
  expect(d.scoring.itemRules.every(x=>x.transform.type==='identity')).toBe(true)
  expect(d.referencePolicy).toEqual({type:'none'})
 })
 it('scores authored synthetic golden extremes, middle, mixed and partial cases',()=>{
  for (const fixture of pkg.goldenCases) {
   const actual=scoreScale(d,fixture.answers)
   expect(actual.quality.status).toBe(fixture.expected.quality)
   expect(actual.scores.map(s=>s.key)).toEqual(fixture.expected.totalScoreKeys)
   expect(Object.fromEntries(actual.scores.map(x=>[x.key,x.value]))).toEqual(fixture.expected.scores)
  }
  expect(scoreScale(d,answers('1')).scores.map(x=>x.value)).toEqual([5,5,5,5])
  expect(scoreScale(d,answers('5')).scores.map(x=>x.value)).toEqual([25,25,25,25])
 })
 it('rejects invalid/unrecognized response types and duplicate item codes',()=>{
  for (const wrong of ['0','6','bad',3,2.5,Number.NaN]) expect(()=>scoreScale(d,[{itemCode:item(1),responseValue:wrong},...answers('3').slice(1)])).toThrow('量表回答不合法')
  expect(()=>scoreScale(d,[...answers('3'),{itemCode:item(1),responseValue:'3'}])).toThrow('量表回答不合法')
 })
 it('restricts drafted respondent to adult self and does not auto-admit missing age',()=>{
  const evaluate=(ageMonths?:number,respondentType:'SELF'|'PARENT'='SELF')=>evaluateInstrumentEligibility(source.applicability!,{respondentType,subject:ageMonths===undefined?undefined:{ageMonths},availableContextKeys:[]})
  expect(evaluate(215).outcome).toBe('INELIGIBLE')
  expect(evaluate(216).outcome).toBe('ELIGIBLE')
  expect(evaluate(undefined).outcome).not.toBe('ELIGIBLE')
  expect(evaluate(360,'PARENT').outcome).toBe('INELIGIBLE')
 })
 it('keeps author-contact need as metadata, not an invented authorization',()=>{
  expect(d.license).toMatchObject({status:'unknown',redistribution:'restricted'})
  expect(source.catalog.construct.constructOverlapTags).toContain('license:author_contact_required')
  expect(source.localization?.reviewStatus).toBe('PENDING')
  expect(d.report.interpretations).toHaveLength(4)
  expect(d.report.interpretations.every(x=>x.source.type==='score_only'&&x.bands.length===0)).toBe(true)
 })
})
