import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/scs_sf12_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale } from '../../../modules/scale/scale-scoring'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'
const pkg = projectScalePackage(source)!, d = pkg.definition
const id = (n:number) => 'SCS_SF12_' + String(n).padStart(2,'0')
const all = (v:string) => Array.from({length:12},(_,i)=>({itemCode:id(i+1),responseValue:v}))
describe('SCS-SF12 2021 official total-mean definition; independent Chinese DRAFT (tests NOTRUN)',()=>{
 it('preserves official 12-item order and only formally labelled endpoint anchors',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(pkg.releaseStatus).toBe('DRAFT')
  expect(source.catalog.catalogStatus).toBe('CANDIDATE')
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:12},(_,i)=>id(i+1)))
  expect(d.responseSets[0].options.map(x=>x.label)).toEqual(['几乎从不','2','3','4','几乎总是'])
  expect(d.display.randomizeItems).toBe(false)
 })
 it('applies exactly six negative-item reversals and outputs only 2021 total mean',()=>{
  expect(d.scoring.itemRules.filter(x=>x.transform.type==='reverse').map(x=>x.itemCode)).toEqual([1,4,8,9,11,12].map(id))
  expect(d.scoring.scores).toHaveLength(1)
  expect(d.scoring.scores[0]).toMatchObject({key:'total',type:'total',canonical:true,missingPolicy:{type:'complete_required'},source:{type:'items',aggregation:'mean'}})
  expect(d.referencePolicy).toEqual({type:'none'})
  const arr=[1,2,3,4,5,1,2,3,4,5,1,2].map((v,i)=>({itemCode:id(i+1),responseValue:String(v)}))
  expect(scoreScale(d,arr).scores[0].value).toBe(3.25)
 })
 it('agrees with official six two-item means for every complete synthetic fixture',()=>{
  const groups={"self_kindness":[2,6],"self_judgment":[11,12],"common_humanity":[5,10],"isolation":[4,8],"mindfulness":[3,7],"over_identification":[1,9]}
  const reversed=new Set([1,4,8,9,11,12])
  for(const fixture of pkg.goldenCases){
   const result=scoreScale(d,fixture.answers)
   expect(result.quality.status).toBe(fixture.expected.quality)
   expect(Object.fromEntries(result.scores.map(x=>[x.key,x.value]))).toEqual(fixture.expected.scores)
   if(fixture.answers.length===12){
    const values=new Map(fixture.answers.map(a=>[a.itemCode,Number(a.responseValue)]))
    const transformed=(n:number)=>reversed.has(n)?6-(values.get(id(n)) as number):(values.get(id(n)) as number)
    const paired=Object.values(groups).map(([a,b])=>(transformed(a)+transformed(b))/2)
    expect(result.scores[0].value).toBe(paired.reduce((a,b)=>a+b,0)/6)
   }
  }
 })
 it('does not treat two-item facets, ad hoc score bands or Chinese norms as validated outcomes',()=>{
  expect(d.report.primaryScoreKeys).toEqual(['total'])
  expect(d.report.interpretations).toHaveLength(1)
  expect(d.report.interpretations[0].source).toEqual({type:'score_only'})
  expect(d.report.interpretations[0].bands).toEqual([])
  expect(source.localization?.reviewStatus).toBe('PENDING')
 })
 it('preserves official use/translation claim without claiming public GitHub redistribution',()=>{
  expect(source.catalog.construct.constructOverlapTags).toContain('license:official_any_purpose_use')
  expect(source.catalog.construct.constructOverlapTags).toContain('license:official_translation_permission')
  expect(d.license).toMatchObject({status:'unknown',redistribution:'restricted'})
  expect(source.usageRequirements?.allowedCommercialNatures).toBeUndefined()
 })
 it('refuses malformed responses and limits unverified draft to adult self-report',()=>{
  for(const wrong of ['0','6','bogus',3,3.5,Number.NaN])expect(()=>scoreScale(d,[{itemCode:id(1),responseValue:wrong},...all('3').slice(1)])).toThrow('量表回答不合法')
  const eligible=(months?:number)=>evaluateInstrumentEligibility(source.applicability!,{respondentType:'SELF',subject:months===undefined?undefined:{ageMonths:months},availableContextKeys:[]})
  expect(eligible(215).outcome).toBe('INELIGIBLE')
  expect(eligible(216).outcome).toBe('ELIGIBLE')
  expect(eligible(undefined).outcome).not.toBe('ELIGIBLE')
 })
})
