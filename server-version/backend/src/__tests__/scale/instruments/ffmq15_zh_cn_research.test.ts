import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {SCALE_INSTRUMENT_SOURCE as source} from '../../../modules/scale/instruments/ffmq15_zh_cn_research/1.0.0/instrument'
import {defineScaleInstrumentSource,projectScalePackage} from '../../../modules/scale/onboarding/define-instrument'
import {getScaleInstrumentSource,listScaleInstrumentSources} from '../../../modules/scale/onboarding/instrument-registry'
import {scoreScale,type ScaleAnswer} from '../../../modules/scale/scale-scoring'
import {buildScaleResult,parseScaleResultV2} from '../../../modules/scale/scale-result'
import {hashScaleDefinition} from '../../../modules/scale/scale-definition'
import {evaluateInstrumentEligibility} from '../../../modules/scale/policy/eligibility'
const pkg=projectScalePackage(source)!,d=pkg.definition
const groups:number[][]=[[1, 6, 11], [2, 7, 12], [3, 8, 13], [4, 9, 14], [5, 10, 15]],keys=["observe", "describe", "act_aware", "nonjudge", "nonreact"],reverse:number[]=[3, 4, 7, 8, 9, 13, 14]
const n=15,maximum=5,mid=3
const code=(i:number)=>'FFMQ15_'+String(i).padStart(2,'0')
const answers=(v:number):ScaleAnswer[]=>Array.from({length:n},(_,i)=>({itemCode:code(i+1),responseValue:String(v)}))
const result=(a:ScaleAnswer[])=>buildScaleResult({scaleId:'synthetic-ffmq15',instrumentKey:source.identity.instrumentKey,instrumentVersion:source.identity.instrumentVersion,name:source.catalog.identity.canonicalName,definition:d,answers:a})
const bilingual=JSON.parse(readFileSync(resolve('../../docs/scale-instruments/research-drafts/ffmq15/1.0.0/bilingual-content.json'),'utf8')) as {questions:Array<{number:number;itemCode:string;authorEnglish:string;platformChinese:string;dimension:string;reverse:boolean}>}
describe('ffmq15_zh_cn_research complete independent source',()=>{
 it('validates and registers exactly once as a DRAFT translation',()=>{
  expect(()=>defineScaleInstrumentSource(source)).not.toThrow()
  expect(source.identity).toEqual({instrumentKey:'ffmq15_zh_cn_research',instrumentVersion:'1.0.0'})
  expect(pkg.releaseStatus).toBe('DRAFT')
  expect(getScaleInstrumentSource('ffmq15_zh_cn_research','1.0.0')?.identity).toEqual(source.identity)
  expect(listScaleInstrumentSources().filter(s=>s.identity.instrumentKey==='ffmq15_zh_cn_research')).toHaveLength(1)
 })
 it('keeps the complete fixed item order and original option anchors',()=>{
  expect(d.items.map(x=>x.itemCode)).toEqual(Array.from({length:n},(_,i)=>code(i+1)))
  expect(d.items.map(x=>x.content)).toEqual(bilingual.questions.map(q=>q.platformChinese))
  expect(d.items.every(x=>x.required&&!x.randomizeOptions)).toBe(true)
  expect(d.display.randomizeItems).toBe(false)
  expect(d.responseSets[0].options.map(x=>x.score)).toEqual(Array.from({length:maximum},(_,i)=>i+1))
  expect(d.responseSets[0].options.map(x=>x.label)).toEqual(["从不或极少符合", "很少符合", "有时符合", "经常符合", "非常经常或总是符合"])
 })
 it('uses exact disjoint facets, original aggregation and reverse keys without a total',()=>{
  expect(d.scoring.itemRules.filter(x=>x.transform.type==='reverse').map(x=>x.itemCode)).toEqual(reverse.map(code))
  expect(d.scoring.scores.map(x=>x.key)).toEqual(keys)
  expect(d.scoring.scores.every(s=>s.type==='dimension'&&s.canonical)).toBe(true)
  expect(d.scoring.scores.map(s=>s.source)).toEqual(groups.map(g=>({type:'items',items:g.map(i=>({itemCode:code(i),weight:1})),aggregation:'sum'})))
  expect(d.scoring.defaultMissingPolicy).toEqual({type:'complete_required'})
  expect(new Set(groups.flat()).size).toBe(n)
  expect(d.report.primaryScoreKeys).toEqual(keys)
 })
 for(const f of pkg.goldenCases)it('scores pinned independent arithmetic '+f.name,()=>{
  const actual=scoreScale(d,f.answers)
  expect(actual.quality.status).toBe(f.expected.quality)
  expect(Object.fromEntries(actual.scores.map(x=>[x.key,x.value]))).toEqual(f.expected.scores)
  expect(actual.scores.filter(s=>s.type==='total')).toEqual([])
 })
 it('keeps single-item changes inside the owning facet with correct direction and weight',()=>{
  const baseline=[9, 9, 9, 9, 9]
  expect(scoreScale(d,answers(mid)).scores.map(s=>s.value)).toEqual(baseline)
  for(let i=1;i<=n;i++){
   const input=answers(mid).map(a=>a.itemCode===code(i)?{...a,responseValue:String(mid+2)}:a)
   const actual=scoreScale(d,input).scores
   groups.forEach((g,j)=>expect(actual[j].value).toBeCloseTo(baseline[j]+(g.includes(i)?(reverse.includes(i)?-2:2)/(1):0),12))
  }
 })
 it('does not confuse raw extremes with reverse-keyed facet minima or maxima',()=>{
  expect(scoreScale(d,answers(1)).scores.map(s=>s.value)).toEqual([3, 7, 15, 15, 3])
  expect(scoreScale(d,answers(maximum)).scores.map(s=>s.value)).toEqual([15, 11, 3, 3, 15])
 })
 it('preserves calculable facets but gives no full interpretation when a canonical facet is incomplete',()=>{
  const r=result(answers(mid).slice(1))
  expect(r.quality.status).toBe('invalid')
  expect(r.scores.map(s=>s.value)).toEqual([null, 9, 9, 9, 9])
  expect(r.interpretations).toEqual([])
  expect(r.itemScores).toHaveLength(n-1)
  expect(r.scores.every(s=>!s.prorated)).toBe(true)
 })
 it('rejects illegal, duplicate and unknown responses',()=>{
  for(const value of ['0',String(maximum+1),'bad','',2.5,Number.NaN])expect(()=>result([{itemCode:code(1),responseValue:value},...answers(mid).slice(1)])).toThrow('量表回答不合法')
  expect(()=>result([...answers(mid),answers(mid)[0]])).toThrow('量表回答不合法')
  expect(()=>result([...answers(mid),{itemCode:code(n+1),responseValue:'3'}])).toThrow('量表回答不合法')
 })
 it('checks the adult boundary, missing age and wrong respondent independently',()=>{
  const elig=(ageMonths?:number,respondentType:'SELF'|'PARENT'='SELF')=>evaluateInstrumentEligibility(source.applicability!,{respondentType,subject:ageMonths===undefined?undefined:{ageMonths},availableContextKeys:[]})
  expect(elig(215).outcome).toBe('INELIGIBLE');expect(elig(216).outcome).toBe('ELIGIBLE')
  expect(elig().outcome).toBe('INDETERMINATE');expect(elig(216,'PARENT').outcome).toBe('INELIGIBLE')
 })
 it('generates actual plain-language facet reports without norms, bands or intervention claims',()=>{
  for(const name of ['minimum','maximum','mixed_independent']){
   const f=pkg.goldenCases.find(g=>g.name===name)!,r=parseScaleResultV2(result(f.answers))
   expect(r.method.reportVersion).toBe('1.0.0');expect(r.references).toEqual([])
   expect(r.interpretations).toHaveLength(keys.length)
   expect(r.scores.every(s=>s.type==='dimension')).toBe(true)
   expect(r.scores.every(s=>JSON.stringify(s.range)===JSON.stringify({min:3,max:15}))).toBe(true)
   for(const i of r.interpretations){
    expect(i.label).toBeNull();expect(i.referenceVersion).toBeNull()
    expect(i.interpretation.length).toBeGreaterThan(100)
    expect(i.interpretation).not.toMatch(/CFA|Cronbach|ReferenceSet|canonical|百分位|标准差|\d/)
    expect(i.guidance.some(g=>g.category==='reflection')).toBe(true)
    expect(i.guidance.some(g=>g.category==='strategy')).toBe(true)
   }
  }
  expect(d.report.interpretations.every(i=>i.bands.length===0)).toBe(true)
  expect(d.referencePolicy).toEqual({type:'none'});expect(pkg.references).toEqual([])
 })
 it('keeps reporting and catalog outside measurement identity while content changes its hash',()=>{
  const changed=structuredClone(d);changed.report.reportVersion='1.0.1';changed.report.disclaimer+=' 新说明'
  expect(hashScaleDefinition(changed)).toBe(hashScaleDefinition(d))
  changed.items[0].content+=' 内容改变';expect(hashScaleDefinition(changed)).not.toBe(hashScaleDefinition(d))
  expect(d.scoring.scoringVersion).toBe('1.0.0');expect(source.localization?.localizationVersion).toBe('1.0.0')
  expect(source.catalog.catalogManifestVersion).toBe(1)
 })
 it('has rich factual eight-axis tags and does not claim a validated Chinese translation',()=>{
  const tags=source.catalog.construct.constructOverlapTags
  expect(tags.length).toBeGreaterThanOrEqual(40);expect(new Set(tags).size).toBe(tags.length)
  for(const axis of ['domain','construct','orientation','population','response','use','license','language_validation'])expect(tags.some(t=>t.startsWith(axis+':'))).toBe(true)
  expect(tags.filter(t=>/[\u4e00-\u9fff]/.test(t)).length).toBeGreaterThanOrEqual(8)
  expect(tags).toContain('license:cc_by_3_0')
  expect(tags).toContain('use:not_diagnostic')
  expect(d.license.note).toContain('CC BY 3.0')
  expect(source.localization?.expertReviewStatus).toBe('PENDING');expect(source.localization?.localEvidenceRefs).toEqual([])
  expect(d.report.audienceContract?.respondent).toBe('ADULT_SELF')
  expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL','COMMERCIAL'])
 })
 it('uses the corrected author-file provenance and original sum scale, not an automatic mindfulness total',()=>{
  expect(d.source?.citation).toContain('2012');expect(d.source?.citation).toContain('2016')
  expect(source.catalog.administration.layoutConstraints.join(' ')).toContain('3–15')
  expect(source.catalog.administration.layoutConstraints.join(' ')).toContain('结构不稳定')
  expect(source.catalog.evidence[0].studyDesign).not.toContain('中国常模已建立')
  expect(source.catalog.evidence[0].notes).toContain('39题后抽取15题')
 })
})
