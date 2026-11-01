import fs from 'node:fs'
import path from 'node:path'
import {describe,it,expect} from 'vitest'
import {loadPackage} from '../../modules/assessment-bundle/onboarding/loader'
import {mapDeclarativeEvidence,runDeclarativeEvidence} from '../../modules/assessment-bundle/onboarding/engine'
import {requireCognitiveRegistryEntry} from '../../modules/cognitive/cognitive.registry'
import {cognitiveSeeds} from '../../modules/cognitive/generated/seeds'
import {scoreScale,calculateScoreRanges} from '../../modules/scale/scale-scoring'
import {parseScaleInstrumentSourceSchema} from '../../modules/scale/onboarding/schema'
import {getScaleInstrumentSource} from '../../modules/scale/onboarding/instrument-registry'
import type {BundleEngineInputV1} from '../../modules/assessment-bundle/registry'
import {getExecutableScalePackage} from '../../modules/scale/onboarding/executable-registry'
import {validateScalePackage} from '../../modules/scale/scale-package.registry'
import {createCodeBundleDefinitionProvider} from '../../modules/bundle-product/code-catalog'

const key='cognitive_self_regulation_adolescent_en_v1'
const pack=()=>loadPackage(path.resolve(__dirname,'../../modules/assessment-bundle/packages',key,'1.0.0'))
const source=getScaleInstrumentSource('texi_self_en','1.0.0')!
const definition=source.executable!.definition
const smoke=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../modules/assessment-bundle/ci-fixtures',key,'1.0.0.json'),'utf8'))
function input():BundleEngineInputV1 {
 const p=pack()
 const cognitiveSources=p.manifest.cognitiveDependencies.map(dep=>{
  const slot=p.manifest.definition.slots.find(s=>s.slotKey===dep.slotKey)!
  const entry=requireCognitiveRegistryEntry(slot.instrumentKey,dep.engineVersion,dep.scoringVersion)
  const seed=cognitiveSeeds.find(s=>s.testType===slot.instrumentKey&&s.configVersion===dep.configVersion)!
  const config=entry.configSchema.parse({...seed.config as object,...entry.profiles.standard!.configPatch})
  const trials=smoke.slots[slot.slotKey].trials.map((t:any)=>({...t,payload:entry.trialSchema.parse(t.payload)}))
  const scored=entry.score({config,trials,randomSeed:smoke.randomSeed})
  expect(scored.qualityFlags.interpretable).toBe(true)
  return {slotKey:slot.slotKey,instrumentKey:slot.instrumentKey,instrumentVersion:slot.instrumentVersion,sourceResultHash:'1'.repeat(64),qualityState:'interpretable' as const,metrics:scored.metrics}
 })
 const scale=scoreScale(definition,smoke.slots.texi.answers)
 const i={snapshot:{bundleKey:key,bundleVersion:'1.0.0'},compiledRuntime:{},contextFacts:null,aggregateInputHash:null,declarativePackage:p,evidence:[],cognitiveSources,scaleSources:[{slotKey:'texi',instrumentKey:'texi_self_en',instrumentVersion:'1.0.0',sourceResultHash:'2'.repeat(64),envelopeResultHash:null,qualityState:scale.quality.status,scores:scale.scores.map(s=>({scoreKey:s.key,value:s.value,status:s.status,criterionBandKey:null}))}]} as unknown as BundleEngineInputV1
 i.evidence=mapDeclarativeEvidence(i)
 return i
}
function conclusions(i:BundleEngineInputV1){
 const r=runDeclarativeEvidence(i);expect(r.kind).toBe('COMPUTED')
 return (r as {payload:{conclusions:Array<{ruleId:string}>}}).payload.conclusions.map(c=>c.ruleId)
}
describe('adolescent cross-method DRAFT',()=>{
 it('keeps true self-report, language, age and old English observers distinct',()=>{
  parseScaleInstrumentSourceSchema(source)
  expect(validateScalePackage(getExecutableScalePackage('texi_self_en','1.0.0')!).valid).toBe(true)
  expect(definition.report.audienceContract!.locale).toBe('en')
  expect(source.executable).toMatchObject({releaseStatus:'DRAFT',contentLocale:'en'})
  expect(source.applicability).toMatchObject({respondentTypes:['SELF'],subject:{ageMonths:{minInclusive:156,maxExclusive:240}}})
  expect(source.catalog.population).toMatchObject({minAge:13,maxAge:19})
  expect(definition.items).toHaveLength(20)
  expect(definition.items[0].content).toBe('I have difficulty remembering long instructions')
  expect(definition.items[13].content).toMatch(/^People that I meet/)
  for(const old of ['texi_parent_zh_cn','texi_teacher_zh_cn'])expect(getScaleInstrumentSource(old,'1.0.0')!.executable!.contentLocale).toBe('en')
  expect(createCodeBundleDefinitionProvider().list().some(e=>e.definition.bundleKey===key)).toBe(true)
 })
 it('scores official 9/11 factor means, including item13 in working memory, without a total',()=>{
  const answers=definition.items.map(x=>({itemCode:x.itemCode,responseValue:x.itemCode==='TEXI-13'?'5':'1'}))
  const r=scoreScale(definition,answers)
  expect(r.quality.status).toBe('interpretable')
  expect(r.scores.map(s=>[s.key,s.value])).toEqual([['working_memory',13/9],['inhibition',1]])
  expect([...calculateScoreRanges(definition).values()]).toEqual([{min:1,max:5},{min:1,max:5}])
  const missing=scoreScale(definition,answers.filter(a=>a.itemCode!=='TEXI-13'))
  expect(missing.scores.find(s=>s.key==='working_memory')!.value).toBeNull()
  expect(missing.scores.find(s=>s.key==='inhibition')!.value).toBe(1)
 })
 it('carries real scorers into independent and complementary report rules, retaining exact denominators',()=>{
  const i=input(),go=i.cognitiveSources!.find(s=>s.slotKey==='gonogo')!,cpt=i.cognitiveSources!.find(s=>s.slotKey==='cpt')!
  expect(go.metrics).toMatchObject({nogoTrialCount:30,goTrialCount:90,commissionErrors:1,commissionRate:1/30,omissionRate:0})
  expect(cpt.metrics).toMatchObject({targetCount:36,hitCount:35,omissionRate:1/36,commissionRate:0})
  expect(conclusions(i).sort()).toEqual([...smoke.expectedRuleIds].sort())
  expect(pack().schemaVersion).toBe(1)
  expect(i.evidence.every(e=>!['CONVERGENT','DIVERGENT'].includes(e.role))).toBe(true)
  expect(pack().manifest.definition.slots.every(s=>!s.valueSelectors!.includes('score'))).toBe(true)
 })
 it('preserves zero and signed differences; missing or bad self-report cannot produce a complete cross-method conclusion',()=>{
  const i=input()
  i.cognitiveSources!.find(s=>s.slotKey==='flanker')!.metrics.flankerEffectMs=-40
  i.evidence=mapDeclarativeEvidence(i)
  expect(i.evidence.find(e=>e.evidenceKey==='flanker.flanker_effect_ms')!.value).toMatchObject({state:'present',value:-40,unit:'ms'})
  expect(i.evidence.find(e=>e.evidenceKey==='gonogo.omission_rate')!.value).toMatchObject({state:'present',value:0})
  i.scaleSources![0].scores[0].value=null
  i.evidence=mapDeclarativeEvidence(i)
  const missing=conclusions(i)
  expect(missing).toContain('texi_missing');expect(missing).toContain('task_attention')
  expect(missing).not.toContain('methods_complement');expect(missing).not.toContain('action_steps')
  i.scaleSources![0].scores[0].value=3;i.scaleSources![0].qualityState='limited'
  i.evidence=mapDeclarativeEvidence(i)
  expect(conclusions(i)).not.toContain('methods_complement')
  expect(conclusions(i)).not.toContain('daily_self_report')
  i.scaleSources![0].qualityState='invalid';i.evidence=mapDeclarativeEvidence(i)
  expect(conclusions(i)).toContain('texi_invalid')
 })
 it('rejects observer identity substitution and keeps audience blocks and source disclosure bounded',()=>{
  const i=input();i.scaleSources![0].instrumentKey='texi_parent_zh_cn'
  expect(()=>mapDeclarativeEvidence(i)).toThrow('DECLARATIVE_SOURCE_IDENTITY_MISMATCH:texi')
  expect(pack().report.blocks.every(b=>b.audience.every(a=>a==='student'||a==='admin'))).toBe(true)
  expect(source.disclosure!.audiences.teacher).toBeUndefined()
  expect(source.disclosure!.audiences.parent).toBeUndefined()
  expect(source.disclosure!.unknownAudience).toBe('DENY')
 })
})
