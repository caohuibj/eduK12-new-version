import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/mpmi_s22_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale, type ScaleAnswer } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'

const pkg=projectScalePackage(source)!, d=pkg.definition
const code=(n:number)=>'MPMI_'+String(n).padStart(2,'0')
const keys=['pma','pmsi','pmse']
const groups=[Array.from({length:8},(_,i)=>i+1),Array.from({length:7},(_,i)=>i+9),Array.from({length:7},(_,i)=>i+16)]
const allThree:ScaleAnswer[]=Array.from({length:22},(_,i)=>({itemCode:code(i+1),responseValue:'3'}))
const result=(answers:ScaleAnswer[])=>buildScaleResult({scaleId:'synthetic-mpmi',instrumentKey:source.identity.instrumentKey,instrumentVersion:source.identity.instrumentVersion,name:source.catalog.identity.canonicalName,definition:d,answers})
describe('MPMI-s22 author Appendix A Chinese working version',()=>{
  it('validates the complete 22-item source and remains an independent draft',()=>{
    expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
    expect(source.identity).toEqual({instrumentKey:'mpmi_s22_zh_cn_research',instrumentVersion:'1.0.0'})
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(d.items).toHaveLength(22)
    expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:22},(_,i)=>code(i+1)))
    expect(d.items.every(x=>!x.required&&!x.randomizeOptions)).toBe(true)
    expect(d.display.randomizeItems).toBe(false)
    expect(d.responseSets[0].options.map(x=>x.score)).toEqual([1,2,3,4,5])
  })
  it('uses author 8/7/7 means and precisely four reverse items, never an invented total',()=>{
    expect(d.scoring.scores.map(s=>s.key)).toEqual(keys)
    expect(d.scoring.itemRules.filter(r=>r.transform.type==='reverse').map(r=>r.itemCode)).toEqual([1,4,5,8].map(code))
    expect(d.scoring.scores.map(s=>s.source.type==='items'?s.source.items.map(i=>i.itemCode):[])).toEqual(groups.map(g=>g.map(code)))
    expect(d.scoring.scores.every(s=>s.type==='dimension'&&s.source.type==='items'&&s.source.aggregation==='mean')).toBe(true)
    expect(d.scoring.scores.map(s=>s.missingPolicy)).toEqual([7,6,6].map(minimumAnswered=>({type:'prorate_if_min_answered',minimumAnswered})))
    expect(d.report.primaryScoreKeys).toEqual(keys)
    expect(d.referencePolicy).toEqual({type:'none'})
  })
  for(const fixture of pkg.goldenCases)it('matches independent arithmetic: '+fixture.name,()=>{
    const actual=scoreScale(d,fixture.answers)
    expect(actual.quality.status).toBe(fixture.expected.quality)
    expect(actual.scores.map(s=>s.key)).toEqual(keys)
    expect(Object.fromEntries(actual.scores.map(s=>[s.key,s.value]))).toEqual(fixture.expected.scores)
  })
  it('does not confuse raw extremes with the reverse-keyed ability dimension',()=>{
    expect(scoreScale(d,allThree.map(x=>({...x,responseValue:'1'}))).scores.map(s=>s.value)).toEqual([3,1,1])
    expect(scoreScale(d,allThree.map(x=>({...x,responseValue:'5'}))).scores.map(s=>s.value)).toEqual([3,5,5])
  })
  it('changes only the owning dimension, preserving the reverse direction',()=>{
    for(let n=1;n<=22;n++){
      const values=scoreScale(d,allThree.map(x=>x.itemCode===code(n)?{...x,responseValue:'5'}:x)).scores.map(s=>s.value!)
      for(let j=0;j<3;j++){
        const delta=groups[j].includes(n)?([1,4,5,8].includes(n)?-2:2)/groups[j].length:0
        expect(values[j]).toBeCloseTo(3+delta,12)
      }
    }
  })
  it('uses available-item means for at most one omission per dimension without filling answers',()=>{
    const input=allThree.filter(x=>![code(1),code(9),code(16)].includes(x.itemCode))
    const r=result(input)
    expect(r.quality.status).toBe('limited')
    expect(r.scores.map(s=>s.value)).toEqual([3,3,3])
    expect(r.itemScores).toHaveLength(19)
    expect(r.scores.map(s=>s.answeredItems.length)).toEqual([7,6,6])
    expect(r.interpretations).toHaveLength(3)
    const bad=result(input.filter(x=>x.itemCode!==code(2)))
    expect(bad.scores.map(s=>s.value)).toEqual([null,3,3])
    expect(bad.interpretations).toEqual([])
  })
  it('rejects invalid, duplicate and unknown answers',()=>{
    for(const value of ['0','6','bad','',2.5,Number.NaN]){
      expect(()=>result([{itemCode:code(1),responseValue:value},...allThree.slice(1)])).toThrow('量表回答不合法')
    }
    expect(()=>result([...allThree,allThree[0]])).toThrow('量表回答不合法')
    expect(()=>result([...allThree,{itemCode:code(23),responseValue:'3'}])).toThrow('量表回答不合法')
  })
  it('checks the adult scope and never guesses a missing age',()=>{
    const eligibility=(ageMonths?:number)=>evaluateInstrumentEligibility(source.applicability!,{respondentType:'SELF',subject:ageMonths===undefined?undefined:{ageMonths},availableContextKeys:[]})
    expect(eligibility(227).outcome).toBe('INELIGIBLE')
    expect(eligibility(228).outcome).toBe('ELIGIBLE')
    expect(eligibility(863).outcome).toBe('ELIGIBLE')
    expect(eligibility(864).outcome).toBe('INELIGIBLE')
    expect(eligibility().outcome).toBe('INDETERMINATE')
  })
  it('produces readable actual reports without thresholds or a memory-disease label',()=>{
    for(const name of ['minimum','maximum','mixed_independent','one_missing_each']){
      const r=parseScaleResultV2(result(pkg.goldenCases.find(f=>f.name===name)!.answers))
      expect(r.interpretations).toHaveLength(3)
      expect(r.interpretations.every(i=>i.label===null&&i.referenceVersion===null&&i.guidance.length>=2)).toBe(true)
      for(const i of r.interpretations)expect(i.interpretation).not.toMatch(/CFA|Cronbach|ReferenceSet|canonical|百分位|标准差|\d/)
      expect(r.references).toEqual([])
    }
    expect(d.report.interpretations.every(i=>i.summary.length>=100&&i.bands.length===0)).toBe(true)
  })
  it('keeps original-language evidence, working translation and licensing distinct',()=>{
    expect(source.localization?.sourceLocale).toBe('en')
    expect(source.localization?.expertReviewStatus).toBe('PENDING')
    expect(source.localization?.localEvidenceRefs).toEqual([])
    expect(source.catalog.evidence.every(e=>e.locale==='de'&&e.territory==='DE')).toBe(true)
    expect(d.license.note).toContain('CC BY 4.0')
    expect(d.license.note).toContain('2019')
    expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL','COMMERCIAL'])
  })
})
