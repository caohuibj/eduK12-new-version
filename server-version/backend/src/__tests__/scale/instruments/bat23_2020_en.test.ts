import { describe,it,expect,vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
vi.mock('../../../modules/scale/onboarding/instrument-registry',()=>({getScaleInstrumentSource:()=>undefined}))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/bat23_2020_en/1.0.0/instrument'
import { projectScalePackage,defineScaleInstrumentSource } from '../../../modules/scale/onboarding/define-instrument'
import { previewScaleInstrument } from '../../../modules/scale/onboarding/preview'
import { scoreScale,type ScaleAnswer } from '../../../modules/scale/scale-scoring'
import { buildScaleResult } from '../../../modules/scale/scale-result'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'
const pkg=projectScalePackage(source)!,d=pkg.definition,code=(n:number)=>'BAT_'+String(n).padStart(2,'0')
const groups=[[1,2,3,4,5,6,7,8],[9,10,11,12,13],[14,15,16,17,18],[19,20,21,22,23]],keys=['exhaustion','mental_distance','cognitive_impairment','emotional_impairment','burnout_core']
const answers=(values:number[]):ScaleAnswer[]=>values.map((v,i)=>({itemCode:code(i+1),responseValue:String(v)}))
const mid=answers(Array(23).fill(3)),result=(a:ScaleAnswer[])=>buildScaleResult({scaleId:'synthetic-bat23',instrumentKey:source.identity.instrumentKey,instrumentVersion:source.identity.instrumentVersion,name:source.catalog.identity.canonicalName,definition:d,answers:a})
const form=JSON.parse(readFileSync(resolve('../../docs/scale-instruments/research-drafts/bat23_2020_en/1.0.0/content-manifest.json'),'utf8')) as {items:Array<{platformEnglish:string}>}
describe('BAT2020 exact English work core23 and original bilingual feedback',()=>{
 it('keeps the exact published complete English form separate from Chinese and secondary symptoms',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow();expect(source.identity).toEqual({instrumentKey:'bat23_2020_en',instrumentVersion:'1.0.0'})
  expect(pkg.releaseStatus).toBe('DRAFT');expect(d.items).toHaveLength(23)
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:23},(_,i)=>code(i+1)))
  expect(d.items.map(x=>x.content)).toEqual(form.items.map(x=>x.platformEnglish))
  expect(d.items[5].content).toContain('somehow, I');expect(d.items.every(x=>!x.randomizeOptions)).toBe(true)
  expect(d.responseSets[0].options.map(x=>[x.label,x.score])).toEqual(['Never','Rarely','Sometimes','Often','Always'].map((s,i)=>[s,i+1]))
  expect(source.executable?.contentLocale).toBe('en');expect(source.localization?.targetLocale).toBe('en')
 })
 it('uses four exact groups and a genuinely item-weighted total, with no reversals',()=>{
  expect(d.scoring.itemRules.some(x=>x.transform.type==='reverse')).toBe(false)
  expect(d.scoring.scores.map(x=>x.key)).toEqual(keys)
  expect(d.scoring.scores.slice(0,4).map(x=>x.source.type==='items'?x.source.items.map(y=>y.itemCode):[])).toEqual(groups.map(g=>g.map(code)))
  const scores=scoreScale(d,answers(Array.from({length:23},(_,i)=>i<8?5:1))).scores
  expect(scores.map(x=>x.value)).toEqual([5,1,1,1,55/23]);expect(scores[4].value).not.toBe(2)
  expect(scores.filter(x=>x.type==='total').map(x=>x.key)).toEqual(['burnout_core'])
 })
 for(const f of pkg.goldenCases)it('matches pinned arithmetic '+f.name,()=>{
  const actual=scoreScale(d,f.answers);expect(actual.quality.status).toBe(f.expected.quality)
  expect(Object.fromEntries(actual.scores.map(x=>[x.key,x.value]))).toEqual(f.expected.scores)
  expect(actual.scores.every(x=>x.range?.min===1&&x.range.max===5)).toBe(true)
 })
 it('changes exactly one dimension and the item-weighted total for each changed response',()=>{
  for(let i=1;i<=23;i++){
   const a=mid.map(x=>x.itemCode===code(i)?{...x,responseValue:'5'}:x),scores=scoreScale(d,a).scores
   for(let j=0;j<4;j++)expect(scores[j].value).toBeCloseTo(3+(groups[j].includes(i)?2/groups[j].length:0),12)
   expect(scores[4].value).toBeCloseTo(3+2/23,12)
  }
 })
 it('does not impute missing answers or issue an incomplete-result interpretation',()=>{
  const r=result(mid.slice(1));expect(r.quality.status).toBe('invalid');expect(r.interpretations).toEqual([])
  expect(r.scores.map(x=>x.value)).toEqual([null,3,3,3,null]);expect(r.scores.every(x=>!x.prorated)).toBe(true);expect(r.itemScores).toHaveLength(22)
 })
 it('rejects illegal options, unknown items and duplicate answers',()=>{
  for(const value of ['0','6','bad','',2.5,Number.NaN])expect(()=>result([{itemCode:code(1),responseValue:value},...mid.slice(1)])).toThrow('量表回答不合法')
  expect(()=>result([...mid,mid[0]])).toThrow('量表回答不合法');expect(()=>result([...mid,{itemCode:code(24),responseValue:'3'}])).toThrow('量表回答不合法')
 })
 it('requires adult self-report age and refuses activation of this unpublished source',()=>{
  const age=(ageMonths?:number)=>evaluateInstrumentEligibility(source.applicability!,{respondentType:'SELF',subject:ageMonths===undefined?undefined:{ageMonths},availableContextKeys:[]})
  expect(age(215).outcome).toBe('INELIGIBLE');expect(age(216).outcome).toBe('ELIGIBLE');expect(age().outcome).toBe('INDETERMINATE')
  const p=previewScaleInstrument({source,authorizations:[],locale:'en',territory:'CN',commercialNature:'NON_COMMERCIAL',deploymentModes:['STANDALONE'],nowIso:'2026-10-26T07:00:00.000Z'})
  expect(p.sourceValidation.ok).toBe(true);expect(p.allowActivation).toBe(false);expect(p.blockers).toContain('EXECUTABLE_NOT_PUBLISHED')
 })
 it('generates real English-primary feedback with a readable Chinese parallel, without score bands',()=>{
  for(const f of pkg.goldenCases.filter(x=>['minimum','maximum','mixed_cyclic'].includes(x.name))){
   const r=result(f.answers);expect(r.interpretations).toHaveLength(5);expect(r.references).toEqual([])
   expect(r.method).toMatchObject({instrumentVersion:'1.0.0',scoringVersion:'1.0.0',reportVersion:'1.0.0'})
   for(const i of r.interpretations){expect(i.label).toBeNull();expect(i.interpretation).toContain('中文对照：');expect(i.interpretation.split('中文对照：')[0].length).toBeGreaterThan(100);expect(i.referenceVersion).toBeNull()}
  }
  expect(d.report.audienceContract?.locale).toBe('en');expect(d.versionAxes?.locale).toBe('en');expect(d.referencePolicy).toEqual({type:'none'})
  expect(d.report.interpretations.every(x=>x.source.type==='score_only'&&x.bands.length===0)).toBe(true)
 })
 it('keeps version axes and source-language evidence factual with rich eight-axis search tags',()=>{
  const changed=structuredClone(d);changed.report.reportVersion='1.0.1';expect(hashScaleDefinition(changed)).toBe(hashScaleDefinition(d))
  changed.items[0].content+=' changed';expect(hashScaleDefinition(changed)).not.toBe(hashScaleDefinition(d))
  expect(source.catalog.evidence.every(x=>x.locale==='nl'&&x.territory==='BE')).toBe(true);expect(source.scientificReview).toBeUndefined()
  const tags=source.catalog.construct.constructOverlapTags;expect(tags.length).toBeGreaterThanOrEqual(50);expect(new Set(tags).size).toBe(tags.length)
  for(const axis of ['domain','construct','orientation','population','response','use','license','language_validation'])expect(tags.some(x=>x.startsWith(axis+':'))).toBe(true)
  expect(d.license.note).toContain('CC BY 4.0');expect(source.localization?.expertReviewStatus).toBe('PENDING')
 })
})
