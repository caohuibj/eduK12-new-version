import {beforeAll,afterAll,afterEach,it,expect,vi} from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import {runtimePackageFixture} from './runtime-packages.fixture'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
import {freezeBundleProductionDefinition} from '../../modules/bundle-product/definition-provider'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {computeSurveyNativeReports,surveyNativeFeedbackAudience} from '../../modules/bundle-product/survey-native'
import {projectSurveyParticipantFeedback} from '../../modules/survey/participant-feedback-response'
import {prepareSurveyNativeAdmissions} from '../../modules/bundle-product/survey-native-admission'
import {computeSurveyFinal} from '../../modules/survey/final.compute'
import {freezeSurveyTaskPrefix} from '../../modules/survey/task-prefix'
import {surveyPersonalLeaf} from '../../modules/survey/personal-tracking'
import {surveyNativeFixture} from './survey-native.fixture'
import type {SurveyNativeBundle} from '../../modules/bundle-product/survey-native'
import type {ResearchFrozenPublication} from '../../modules/survey/publication.service'
import type {SurveyComputedFinal} from '../../modules/survey/final.compute'

beforeAll(()=>{vi.stubEnv('DATA_ENCRYPTION_KEY','1'.repeat(64))})
afterAll(()=>vi.unstubAllEnvs())
afterEach(()=>vi.useRealTimers())
const startedAt=new Date('2026-11-01T00:00:00.000Z')
const answers=(result:SurveyComputedFinal)=>Object.fromEntries(result.units.map(u=>[u.instrumentKey,u.rawAnswers]))
/** Reuse the actual B10 candidate and hand-recorded score facts. No leaf scorer. */
function fixture(dob='2010-01'){
 const pack=runtimePackageFixture('B10')
 const definition=freezeBundleProductionDefinition(packageEntry(pack),{frozenAt:'2026-11-01T00:00:00.000Z',sourceReference:'synthetic-native-age'})
 const native:SurveyNativeBundle={schemaVersion:1,source:{compositeId:'00000000-0000-4000-8000-000000000001',definitionHash:definition.contentHash,bindingsHash:'1'.repeat(64),context:definition.contextDefinition!.fields.map(f=>({contextKey:f.contextKey,slotKey:'context',itemKey:f.contextKey}))},ownerId:'synthetic-owner',definition,policies:{},reportAudiences:{}}
 const units:ResearchFrozenPublication['units']=[],results:SurveyComputedFinal['units']=[]
 for(const slot of definition.bundleSnapshot.slotBindings.filter(s=>s.unitType==='SCALE')){
  const source=JSON.parse(fs.readFileSync(path.resolve(__dirname,`../../modules/scale/instruments/${slot.instrumentKey}/${slot.instrumentVersion}/source.json`),'utf8')),d=source.executable.definition
  native.policies[slot.slotKey]={disposition:'FROZEN_V2',disclosure:source.disclosure};native.reportAudiences[slot.slotKey]=d.report.audienceContract.audience
  units.push({draftId:slot.slotKey,instrumentKey:slot.slotKey,kind:'SCALE',title:slot.slotKey,draftRevision:1,sourceDigest:canonicalHash(d),scoringDigest:canonicalHash(d.scoring),compiledDefinition:d,displayDefinition:{},measurementRelease:{releaseId:'synthetic-'+slot.slotKey,contentHash:'2'.repeat(64),measurementHash:'3'.repeat(64)},participantFeedback:{policyVersion:'SURVEY_RAW_METRICS_V1',mode:'DESCRIPTIVE',metricKeys:slot.valueSelectors??[],release:'AFTER_FINAL'},nativeBundleReport:{definitionHash:definition.contentHash,audience:surveyNativeFeedbackAudience(native,slot.slotKey,d),policy:native.policies[slot.slotKey]}})
  results.push({instrumentKey:slot.slotKey,kind:'SCALE',sourceDigest:canonicalHash(d),scoringDigest:canonicalHash(d.scoring),rawAnswers:{},missing:[],privateScoring:{quality:{status:'interpretable',flags:[]},itemScores:[],scores:d.scoring.scores.map((s:any)=>({...s,value:slot.slotKey==='bedtime'?1.7777777777777777:6,range:slot.slotKey==='bedtime'?{min:1,max:5}:{min:0,max:32},status:'calculated',expectedItems:d.items.map((i:any)=>i.itemCode),answeredItems:d.items.map((i:any)=>i.itemCode),prorated:false}))}})
 }
 units.push({draftId:'context',instrumentKey:'context',kind:'FORM',title:'背景',draftRevision:1,sourceDigest:'form',scoringDigest:null,compiledDefinition:{},displayDefinition:{}})
 results.push({instrumentKey:'context',kind:'FORM',sourceDigest:'form',scoringDigest:null,rawAnswers:{adult_confirmed:'true',birth_year_month:dob},missing:[],privateScoring:null})
 const p={schemaVersion:1 as const,importId:'b10-import',toolId:'synthetic-tool',hash:'hash',title:'B10',family:'BUNDLE' as const,parentGrantId:'synthetic-whole-grant',report:null,nativeBundle:native,slots:units.map(u=>({slotKey:u.instrumentKey,draftId:u.draftId,instrumentKey:u.instrumentKey,kind:u.kind}))}
 return {snapshot:{units,governedPackages:[p]},result:{schemaVersion:1 as const,definitionDigest:'synthetic-frozen-union',units:results} as SurveyComputedFinal}
}
it('does not expose adult B10 joint or single-leaf feedback for DOB2010 despite adult confirmation',()=>{
 const {snapshot,result}=fixture()
 result.nativeBundleReports=computeSurveyNativeReports(snapshot,result)
 expect(result.nativeBundleReports[0].status).not.toBe('READY')
 expect(projectSurveyParticipantFeedback(snapshot.units,result,true,snapshot.governedPackages)).toEqual({kind:'GENERAL_ONLY'})
 const unit=snapshot.units[0],scoreKey=unit.participantFeedback!.metricKeys[0]
 unit.longitudinalMetricKeys=[scoreKey]
 const tracked=surveyPersonalLeaf({scopedSubjectId:'subject',waveId:'wave',ordinal:1,attemptId:'attempt',resultId:'result',completedAt:startedAt.toISOString(),sourceHash:'synthetic',collectionClosed:true,result,
  snapshot:{...snapshot,longitudinal:{planId:'plan',metrics:[{metricId:'metric',draftId:unit.draftId,instrumentKey:unit.instrumentKey,scoreKey,measurementHash:'3'.repeat(64),unit:'raw'}]}} as ResearchFrozenPublication})
 expect(tracked.metrics.metric).toMatchObject({visible:false,value:null})
})

it('uses DOB and persisted host time before ordinary Scale scoring, never the adult checkbox',()=>{
 const {snapshot,result}=fixture()
 expect(()=>prepareSurveyNativeAdmissions(snapshot.governedPackages,answers(result),startedAt,'bedtime')).toThrow('SURVEY_NATIVE_AGE_OUTSIDE_POPULATION')
 const executable={...snapshot,schemaVersion:1,purpose:'RESEARCH_ONLY',runtimeStatus:'SURVEY_FINAL_V1'} as ResearchFrozenPublication
 expect(()=>computeSurveyFinal(executable,answers(result),undefined,undefined,'FINAL',undefined,startedAt)).toThrow('SURVEY_NATIVE_AGE_OUTSIDE_POPULATION')
 for(const value of ['', 'true', '2008-12']){
  result.units.find(u=>u.instrumentKey==='context')!.rawAnswers.birth_year_month=value
  expect(()=>prepareSurveyNativeAdmissions(snapshot.governedPackages,answers(result),startedAt,'bedtime')).toThrow()
 }
})
it('accepts exactly 18 and preserves saved age, single and joint feedback on later reads',()=>{
 const {snapshot,result}=fixture('2008-11')
 result.nativeBundleAdmissions=prepareSurveyNativeAdmissions(snapshot.governedPackages,answers(result),startedAt,'bedtime')
 expect(result.nativeBundleAdmissions[0].demographic).toMatchObject({frozenAt:startedAt.toISOString(),values:{birthYearMonth:'2008-11',ageMonthsAtFreeze:216}})
 result.nativeBundleReports=computeSurveyNativeReports(snapshot,result)
 expect(result.nativeBundleReports[0]).toMatchObject({status:'READY',errorCode:null})
 const first=projectSurveyParticipantFeedback(snapshot.units,result,true,snapshot.governedPackages)
 expect(first).toMatchObject({kind:'DESCRIPTIVE',measurements:[{instrumentKey:'bedtime'},{instrumentKey:'sleep'}],nativeBundles:[{status:'READY'}]})
 vi.useFakeTimers();vi.setSystemTime(new Date('2040-01-01T00:00:00Z'))
 const saved=JSON.parse(JSON.stringify(result)) as SurveyComputedFinal
 expect(projectSurveyParticipantFeedback(snapshot.units,saved,true,snapshot.governedPackages)).toEqual(first)
 expect(saved.nativeBundleAdmissions![0].demographic!.values.ageMonthsAtFreeze).toBe(216)
 // An immutable age-ineligible/missing-proof result cannot become adult on reread.
 delete saved.nativeBundleAdmissions
 expect(projectSurveyParticipantFeedback(snapshot.units,saved,true,snapshot.governedPackages)).toEqual({kind:'GENERAL_ONLY'})
})
it('checks normalized FORM prefix before entering the bound measurement and keeps locked DOB on reopen',async()=>{
 const {snapshot,result}=fixture('2008-12')
 const form=snapshot.units.find(u=>u.kind==='FORM')!
 form.compiledDefinition={schemaVersion:1,pages:[{pageKey:'background',title:'背景',questions:[
  {itemKey:'birth_year_month',type:'SHORT_TEXT',prompt:'出生年月',required:true,options:[],rows:[]},
  {itemKey:'adult_confirmed',type:'SINGLE',prompt:'成年确认',required:true,options:[{optionKey:'true',label:'是'},{optionKey:'false',label:'否'}],rows:[]},
 ]}]}
 form.displayDefinition=form.compiledDefinition
 const ordered={...snapshot,units:[form,snapshot.units[0]]} as ResearchFrozenPublication
 const tx={surveyCognitiveSession:{findMany:vi.fn().mockResolvedValue([])},situationalAttempt:{findMany:vi.fn().mockResolvedValue([])}}
 const known={projectId:'project',waveId:'wave',attemptId:'attempt',publicationId:'publication'} as never
 const prior={context:result.units.find(u=>u.instrumentKey==='context')!.rawAnswers}
 await expect(freezeSurveyTaskPrefix(tx as never,known,ordered,'bedtime',prior,undefined,startedAt)).rejects.toThrow('SURVEY_NATIVE_AGE_OUTSIDE_POPULATION')
 prior.context.birth_year_month='2008-11'
 const locked=await freezeSurveyTaskPrefix(tx as never,known,ordered,'bedtime',prior,undefined,startedAt)
 expect(locked).toEqual(prior)
 // Existing task locks reject changing DOB when starting another child/reopening.
 const {encryptUnifiedRuntimePayload}=await import('../../modules/assessment-runtime/security')
 tx.surveyCognitiveSession.findMany.mockResolvedValue([{lockedAnswersCipher:encryptUnifiedRuntimePayload(locked),lockedAnswersHash:canonicalHash(locked)}] as never)
 prior.context.birth_year_month='1990-01'
 await expect(freezeSurveyTaskPrefix(tx as never,known,ordered,'bedtime',prior,undefined,startedAt)).rejects.toThrow('不能修改')
})
it('keeps legacy packages without new admission mappings on their existing contract',()=>{
 const {snapshot,result}=surveyNativeFixture()
 expect(prepareSurveyNativeAdmissions(snapshot.governedPackages,answers(result),undefined,snapshot.units[0].instrumentKey)).toEqual([])
 result.nativeBundleReports=computeSurveyNativeReports(snapshot,result)
 expect(result.nativeBundleReports[0].status).toBe('READY')
})
