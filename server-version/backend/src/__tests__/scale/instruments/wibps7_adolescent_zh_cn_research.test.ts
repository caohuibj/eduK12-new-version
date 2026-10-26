import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/wibps7_adolescent_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { getScaleInstrumentSource, listScaleInstrumentSources } from '../../../modules/scale/onboarding/instrument-registry'
import { scoreScale, type ScaleAnswer } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'

const pkg=projectScalePackage(source)!,d=pkg.definition
const n=7,reverse:number[]=[]
const code=(i:number)=>'WIBPS_'+String(i).padStart(2,'0')
const mid:ScaleAnswer[]=Array.from({length:n},(_,i)=>({itemCode:code(i+1),responseValue:'3'}))
const result=(answers:ScaleAnswer[])=>buildScaleResult({scaleId:'synthetic-wibps7',instrumentKey:source.identity.instrumentKey,instrumentVersion:source.identity.instrumentVersion,name:source.catalog.identity.canonicalName,definition:d,answers})
const bilingual=JSON.parse(readFileSync(resolve('../../docs/scale-instruments/research-drafts/wibps7/1.0.0/bilingual-content.json'),'utf8')) as {questions:Array<{itemCode:string;platformChinese:string;reverse:boolean} >}
describe('wibps7_adolescent_zh_cn_research exact source contract',()=>{
 it('validates and registers exactly once as an independent DRAFT identity',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(source.identity).toEqual({instrumentKey:'wibps7_adolescent_zh_cn_research',instrumentVersion:'1.0.0'})
  expect(pkg.releaseStatus).toBe('DRAFT')
  expect(getScaleInstrumentSource('wibps7_adolescent_zh_cn_research','1.0.0')?.identity).toEqual(source.identity)
  expect(listScaleInstrumentSources().filter(s=>s.identity.instrumentKey==='wibps7_adolescent_zh_cn_research')).toHaveLength(1)
 })
 it('retains complete ordered Chinese items and exact scale options',()=>{
  expect(d.items).toHaveLength(n)
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:n},(_,i)=>code(i+1)))
  expect(d.items.map(x=>x.content)).toEqual(bilingual.questions.map(q=>q.platformChinese))
  expect(d.items.every(x=>x.required&&!x.randomizeOptions)).toBe(true)
  expect(d.display.randomizeItems).toBe(false)
  expect(d.responseSets[0].options.map(x=>x.score)).toEqual([1,2,3,4,5])
  expect(d.responseSets[0].options.map(x=>x.label)).toEqual(["几乎从不", "很少", "中立", "经常", "几乎总是"])
  expect(d.items.every(x=>x.content.startsWith('上床后、入睡前，我会'))).toBe(true);expect(d.items[0].content).toContain('YouTube');expect(d.items[6].content).toContain('牛奶')
 })
 it('uses one original-scale sum score and precisely the source reverse keys',()=>{
  expect(d.scoring.itemRules.filter(x=>x.transform.type==='reverse').map(x=>x.itemCode)).toEqual(reverse.map(code))
  expect(bilingual.questions.filter(q=>q.reverse).map(q=>q.itemCode)).toEqual(reverse.map(code))
  expect(d.scoring.scores.map(x=>x.key)).toEqual(['while_in_bed_procrastination'])
  const s=d.scoring.scores[0]
  expect(s.type).toBe('total');expect(s.canonical).toBe(true)
  expect(s.source).toEqual({type:'items',items:Array.from({length:n},(_,i)=>({itemCode:code(i+1),weight:1})),aggregation:'sum'})
  expect(d.scoring.defaultMissingPolicy).toEqual({type:'complete_required'})
 })
 for(const f of pkg.goldenCases)it('scores pinned arithmetic '+f.name,()=>{
  const actual=scoreScale(d,f.answers)
  expect(actual.quality.status).toBe(f.expected.quality)
  expect(Object.fromEntries(actual.scores.map(x=>[x.key,x.value]))).toEqual(f.expected.scores)
  expect(actual.scores.filter(s=>s.type==='total').map(s=>s.key)).toEqual(['while_in_bed_procrastination'])
 })
 it('respects single-item direction and weight independently of stored fixtures',()=>{
  const baseline=21
  expect(scoreScale(d,mid).scores[0].value).toBe(baseline)
  for(let i=1;i<=n;i++){
   const answers=mid.map(x=>x.itemCode===code(i)?{...x,responseValue:'5'}:x)
   expect(scoreScale(d,answers).scores[0].value).toBeCloseTo(baseline+(reverse.includes(i)?-2:2)/1,12)
  }
 })
 it('does not fill missing responses or generate a report on incomplete answers',()=>{
  const r=result(mid.slice(1))
  expect(r.quality.status).toBe('invalid');expect(r.scores[0].value).toBeNull()
  expect(r.interpretations).toEqual([]);expect(r.itemScores).toHaveLength(n-1)
  expect(r.scores[0].prorated).toBe(false)
 })
 it('rejects illegal, duplicate and unknown answers',()=>{
  for(const value of ['0','6','bad','',2.5,Number.NaN])expect(()=>result([{itemCode:code(1),responseValue:value},...mid.slice(1)])).toThrow('量表回答不合法')
  expect(()=>result([...mid,mid[0]])).toThrow('量表回答不合法')
  expect(()=>result([...mid,{itemCode:code(n+1),responseValue:'3'}])).toThrow('量表回答不合法')
 })
 it('refuses out-of-scope and missing ages instead of guessing',()=>{
  const elig=(ageMonths?:number,respondentType:'SELF'|'PARENT'='SELF')=>evaluateInstrumentEligibility(source.applicability!,{respondentType,subject:ageMonths===undefined?undefined:{ageMonths},availableContextKeys:[]})
  expect(elig(180-1).outcome).toBe('INELIGIBLE')
  expect(elig(180).outcome).toBe('ELIGIBLE')
  expect(elig().outcome).toBe('INDETERMINATE')
  expect(elig(180,'PARENT').outcome).toBe('INELIGIBLE')
  expect(elig(251).outcome).toBe('ELIGIBLE');expect(elig(252).outcome).toBe('INELIGIBLE')
 })
 it('builds readable original feedback without norms, labels or diagnostic claims',()=>{
  for(const name of ['minimum','maximum','mixed_independent']){
   const f=pkg.goldenCases.find(g=>g.name===name)!
   const r=parseScaleResultV2(result(f.answers))
   expect(r.method.reportVersion).toBe('1.0.0')
   expect(r.interpretations).toHaveLength(1)
   const i=r.interpretations[0]
   expect(i.label).toBeNull();expect(i.referenceVersion).toBeNull()
   expect(i.interpretation.length).toBeGreaterThan(100)
   expect(i.interpretation).not.toMatch(/CFA|Cronbach|ReferenceSet|canonical|百分位|标准差|\d/)
   expect(i.guidance.some(g=>g.category==='reflection')).toBe(true)
   expect(i.guidance.some(g=>g.category==='strategy')).toBe(true)
   expect(r.references).toEqual([])
   expect(r.scores[0].range).toEqual({min:7,max:35})
  }
  expect(d.report.interpretations[0].bands).toEqual([])
  expect(d.referencePolicy).toEqual({type:'none'})
 })
 it('keeps three axes independently changeable without contaminating measurement',()=>{
  const changed=structuredClone(d);changed.report.reportVersion='1.0.1';changed.report.disclaimer+=' 说明修订'
  expect(hashScaleDefinition(changed)).toBe(hashScaleDefinition(d))
  changed.items[0].content+=' 内容改动';expect(hashScaleDefinition(changed)).not.toBe(hashScaleDefinition(d))
  expect(d.scoring.scoringVersion).toBe('1.0.0')
  expect(source.localization?.localizationVersion).toBe('1.0.0')
  expect(source.catalog.catalogManifestVersion).toBe(1)
 })
 it('has rich factual tags on all eight axes and precise licensing/translation provenance',()=>{
  const tags=source.catalog.construct.constructOverlapTags
  expect(tags.length).toBeGreaterThanOrEqual(40);expect(new Set(tags).size).toBe(tags.length)
  for(const axis of ['domain','construct','orientation','population','response','use','license','language_validation'])expect(tags.some(t=>t.startsWith(axis+':'))).toBe(true)
  expect(tags.filter(t=>/[\u4e00-\u9fff]/.test(t)).length).toBeGreaterThanOrEqual(8)
  expect(tags).toContain('license:cc_by_4_0')
  expect(tags).toContain('use:not_diagnostic')
  expect(d.license.note).toContain('CC BY 4.0')
  expect(source.localization?.expertReviewStatus).toBe('PENDING')
  expect(source.localization?.localEvidenceRefs).toEqual([])
  expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL','COMMERCIAL'])
  expect(d.report.audienceContract?.respondent).toBe('STUDENT_SELF')
 })
})
