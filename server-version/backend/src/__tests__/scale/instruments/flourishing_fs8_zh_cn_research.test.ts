import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/flourishing_fs8_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'
const pkg=projectScalePackage(source)!,d=pkg.definition
const code=(n:number)=>'FS8_'+String(n).padStart(2,'0')
const all=(value:string)=>Array.from({length:8},(_,i)=>({itemCode:code(i+1),responseValue:value}))

describe('FS-8 independent Chinese working DRAFT (test source only; not executed)',()=>{
 it('keeps original 8 statements, fixed order and non-commercial provenance',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(source.executable?.releaseStatus).toBe('DRAFT')
  expect(source.catalog.catalogStatus).toBe('CANDIDATE')
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:8},(_,i)=>code(i+1)))
  expect(d.responseSets[0].options.map(x=>x.score)).toEqual([1,2,3,4,5,6,7])
  expect(d.responseSets[0].options[3].label).toBe('既不赞同也不反对')
 })
 it('uses one total 8–56 without reverse items, fabricated facets or cutoff bands',()=>{
  expect(d.scoring.itemRules.every(x=>x.transform.type==='identity')).toBe(true)
  expect(d.scoring.scores).toHaveLength(1)
  expect(d.scoring.scores[0]).toMatchObject({key:'total',type:'total',canonical:true,missingPolicy:{type:'complete_required'},source:{type:'items',aggregation:'sum'}})
  expect(scoreScale(d,all('1')).scores[0].value).toBe(8)
  expect(scoreScale(d,all('7')).scores[0].value).toBe(56)
  expect(d.referencePolicy).toEqual({type:'none'})
  expect(d.report.interpretations[0].bands).toEqual([])
 })
 it('checks synthetic vectors including incomplete answers',()=>{
  for(const f of pkg.goldenCases){const actual=scoreScale(d,f.answers);expect(actual.quality.status).toBe(f.expected.quality);expect(Object.fromEntries(actual.scores.map(s=>[s.key,s.value]))).toEqual(f.expected.scores)}
 })
 it('rejects out-of-range, wrong type and duplicate item answers',()=>{
  for(const invalid of ['0','8','unreadable',3,2.5,Number.NaN])expect(()=>scoreScale(d,[{itemCode:code(1),responseValue:invalid},...all('4').slice(1)])).toThrow('量表回答不合法')
  expect(()=>scoreScale(d,[...all('4'),{itemCode:code(1),responseValue:'4'}])).toThrow('量表回答不合法')
 })
 it('records adult-self usage and author contact as pending rather than authorization',()=>{
  const eligible=(ageMonths?:number)=>evaluateInstrumentEligibility(source.applicability!,{respondentType:'SELF',subject:ageMonths===undefined?undefined:{ageMonths},availableContextKeys:[]})
  expect(eligible(215).outcome).toBe('INELIGIBLE')
  expect(eligible(216).outcome).toBe('ELIGIBLE')
  expect(eligible(undefined).outcome).not.toBe('ELIGIBLE')
  expect(d.license.status).toBe('unknown')
  expect(d.license.redistribution).toBe('restricted')
  expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL'])
  expect(source.catalog.construct.constructOverlapTags).toContain('license:author_contact_required')
 })
})
