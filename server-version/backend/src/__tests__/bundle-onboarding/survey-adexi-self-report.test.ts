import {it,expect,vi,beforeAll,afterAll} from 'vitest'
import path from 'node:path'
import {loadPackage} from '../../modules/assessment-bundle/onboarding/loader'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
import {freezeBundleProductionDefinition} from '../../modules/bundle-product/definition-provider'
import {computeSurveyNativeReports,savedSurveyNativeFeedback,surveyNativeSourceReportAudience,surveyNativeFeedbackAudience,type SurveyNativeBundle} from '../../modules/bundle-product/survey-native'
import {isFrozenAdultSelfReport} from '../../modules/bundle-product/self-report-audience'
import {getExecutableScalePackage} from '../../modules/scale/onboarding/executable-registry'
import {createScaleProjectionContext} from '../../modules/scale/projection/context-factory'
import {rawParticipantFeedback} from '../../modules/survey/participant-feedback'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {buildCognitiveProfileArtifact} from '../../modules/assessment-authorization/cognitive-profile-artifact'
import {getCognitiveRegistryEntry} from '../../modules/cognitive/cognitive.registry'
import {cognitiveMeasurementRelease} from '../../modules/measurement-content/cognitive'
import {prepareRelease} from '../../modules/measurement-content/release'
import {compileSurveyCognitiveProfile} from '../../modules/survey/cognitive-profile.definition'
import {buildSurveyCognitiveReportSnapshot} from '../../modules/survey/cognitive-bundle-report'
import {seeds as corsiSeeds} from '../../modules/cognitive/tasks/corsi/seeds'
import {seeds as backwardSeeds} from '../../modules/cognitive/tasks/digitbackward/seeds'
beforeAll(()=>vi.stubEnv('DATA_ENCRYPTION_KEY','1'.repeat(64)))
afterAll(()=>vi.unstubAllEnvs())

it('keeps the existing ADEXI SELF release without inventing an R contract or widening report selection',()=>{
 const pack=loadPackage(path.resolve(__dirname,'../../modules/assessment-bundle/packages/working_memory_everyday_adult_zh_cn/0.1.0'))
 const definition=getExecutableScalePackage('adexi_v1','2.0.0')!.definition
 const original=canonicalHash(definition)
 expect(definition.respondentType).toBe('participant_self_report')
 expect(definition.report.audienceContract).toBeUndefined()
 const policy=createScaleProjectionContext({instrumentKey:'adexi_v1',instrumentVersion:'2.0.0',audience:'subject',purpose:'report'}).frozenPolicy
 expect(policy.disclosure.audiences.subject).toMatchObject({numericScores:true,individualInterpretations:true})
 const selected={pack,slotKey:'everyday',definition,configured:true,audience:'student'}
 expect(surveyNativeSourceReportAudience(selected)).toBe('student')
 for(const change of [{configured:false},{configured:undefined},{audience:undefined},{audience:'researcher'},{audience:'parent'},{audience:'teacher'}])
  expect(surveyNativeSourceReportAudience({...selected,...change})).toBeNull()
 for(const respondentType of ['parent_report','teacher_report','observer_report'])
  expect(surveyNativeSourceReportAudience({...selected,definition:{...definition,respondentType}})).toBeNull()
 for(const relationship of [{respondentType:'PARENT'},{respondentType:'TEACHER'},{respondentType:'SELF',subjectUserId:'subject',respondentUserId:'other'}])
  expect(isFrozenAdultSelfReport({pack,slotKey:'everyday',audience:'student',contract:undefined,sourceRespondentType:definition.respondentType,relationship})).toBe(false)
 const explicit=structuredClone(definition)
 explicit.report.audienceContract={schemaVersion:1,respondent:'PARENT_REPORT',audience:'parent',locale:'zh-CN'}
 expect(surveyNativeSourceReportAudience({...selected,definition:explicit})).toBeNull()

 const frozen=freezeBundleProductionDefinition(packageEntry(pack),{frozenAt:'2026-11-01T00:00:00.000Z',sourceReference:'synthetic-adexi-self'})
 const native:SurveyNativeBundle={schemaVersion:1,source:{compositeId:'11111111-1111-4111-8111-111111111111',definitionHash:frozen.contentHash,bindingsHash:'1'.repeat(64),context:[{contextKey:'subject_age_years',slotKey:'context',itemKey:'age'}]},ownerId:'synthetic',definition:frozen,policies:{everyday:policy},reportAudiences:{everyday:surveyNativeSourceReportAudience(selected)}}
 const unit:any={draftId:'adexi',instrumentKey:'adexi',kind:'SCALE',title:'ADEXI',sourceDigest:canonicalHash(definition),scoringDigest:canonicalHash(definition.scoring),compiledDefinition:definition,displayDefinition:{},sourceProvenance:{reportConfigured:true,reportAudience:'student'},nativeBundleReport:{definitionHash:frozen.contentHash,audience:surveyNativeFeedbackAudience(native,'everyday',definition),policy},participantFeedback:{policyVersion:'SURVEY_RAW_METRICS_V1',mode:'DESCRIPTIVE',metricKeys:['working_memory'],release:'AFTER_FINAL'},measurementRelease:{releaseId:'synthetic-published-measurement'}}
 const result:any={schemaVersion:1,definitionDigest:'synthetic-final',units:[{instrumentKey:'adexi',kind:'SCALE',sourceDigest:unit.sourceDigest,scoringDigest:unit.scoringDigest,rawAnswers:{},missing:[],privateScoring:{quality:{status:'interpretable',flags:[]},itemScores:[],scores:[{...definition.scoring.scores.find(s=>s.key==='working_memory'),value:36,status:'calculated',range:{min:9,max:45},expectedItems:[],answeredItems:[],prorated:false}]}},{instrumentKey:'context',kind:'FORM',sourceDigest:'form',scoringDigest:null,rawAnswers:{age:30},missing:[],privateScoring:null}]}
 const governed:any={importId:'b15',title:'B15',nativeBundle:native,slots:[{slotKey:'everyday',draftId:'adexi',instrumentKey:'adexi',kind:'SCALE'},{slotKey:'context',draftId:'context',instrumentKey:'context',kind:'FORM'}]}
 const snapshot:any={units:[unit,{draftId:'context',instrumentKey:'context',kind:'FORM',title:'Background',sourceDigest:'form',scoringDigest:null,compiledDefinition:{},displayDefinition:{}}],governedPackages:[governed]}
 // Unchanged task-report bridge uses recorded synthetic metrics, not a scorer.
 for(const [slot,type] of [['spatial','corsi'],['backward','digitbackward']] as const){
  const seed=(type==='corsi'?corsiSeeds:backwardSeeds)[0],id='11111111-1111-4111-8111-111111111111'
  const entry=getCognitiveRegistryEntry(type,'1.0.0','1.0.0')!
  const measurement={...prepareRelease(cognitiveMeasurementRelease({localId:type,version:seed.configVersion,...seed,scope:{kind:'PLATFORM'}})),releaseId:id,status:'PUBLISHED',publishedBy:id,publishedAt:new Date('2026-11-01T00:00:00Z')} as any
  const f=compileSurveyCognitiveProfile(buildCognitiveProfileArtifact({config:{id,...seed},entry,profile:'standard',measurement:{releaseId:id,contentHash:measurement.contentHash}}),measurement)
  const metrics=type==='corsi'?{trialCount:12,totalCorrectTrials:8,maxSpan:8}:{completedLevelCount:6,totalCorrectTrials:6,maxSpan:7}
  const score={metrics,quality:{state:'interpretable' as const,flags:{},reasons:[]},audit:{trialCount:12,scorerVersion:'1.0.0'}}
  const report=buildSurveyCognitiveReportSnapshot(f,score,new Date('2026-11-01T00:00:00Z'),[])
  snapshot.units.push({draftId:type,instrumentKey:type,kind:'COGNITIVE',title:type,sourceDigest:canonicalHash(f),scoringDigest:f.measurementDigest,compiledDefinition:f,sourceProvenance:{reportConfigured:true},nativeBundleCognitiveReport:{definitionHash:frozen.contentHash,artifactHash:f.artifactHash,selectors:pack.manifest.definition.slots.find(s=>s.slotKey===slot)!.valueSelectors!,reportEnabled:true}})
  result.units.push({instrumentKey:type,kind:'COGNITIVE',sourceDigest:canonicalHash(f),scoringDigest:f.measurementDigest,rawAnswers:{},missing:[],childReference:{resultHash:'b'.repeat(64),measurementDigest:f.measurementDigest},measurement:{measurementDigest:f.measurementDigest,metrics:Object.entries(metrics).map(([key,value])=>({key,value}))},privateScoring:{nativeCognitive:{snapshot:report,snapshotHash:canonicalHash(report),receiptHash:'b'.repeat(64)}}})
  governed.slots.push({slotKey:slot,draftId:type,instrumentKey:type,kind:'COGNITIVE'})
 }
 // Recorded valid score, not a rerun of the leaf scorer or cognitive tasks.
 expect((rawParticipantFeedback(unit,result.units[0],true) as any).metrics).toMatchObject([{key:'working_memory',value:36}])
 result.nativeBundleReports=computeSurveyNativeReports(snapshot,result)
 const saved=result.nativeBundleReports[0]
 expect(saved,JSON.stringify(saved)).toMatchObject({status:'READY',errorCode:null})
 const row=(key:string)=>saved.derivedViews.student.rows.find((r:any)=>r.rowKey===key)
 expect(row('everyday_sum')).toMatchObject({state:'present',value:36})
 expect(row('everyday_position')).toMatchObject({state:'present',value:0.75})
 expect(saved.derivedViews.student.conclusions.some((c:any)=>c.ruleId==='everyday_record')).toBe(true)
 expect(saved.derivedViews.researcher.rows.every((r:any)=>r.state==='redacted')).toBe(true)
 expect(saved.derivedViews.student.rows.filter((r:any)=>r.state==='present')).toHaveLength(11)
 const released=new Map([['adexi',new Set(['working_memory'])],['corsi',new Set(['trialCount','totalCorrectTrials','maxSpan'])],['digitbackward',new Set(['completedLevelCount','totalCorrectTrials','maxSpan'])]])
 expect(savedSurveyNativeFeedback([governed],result,released)[0].derivedView).toEqual(saved.derivedViews.student)
 released.get('adexi')!.clear()
 expect(savedSurveyNativeFeedback([governed],result,released)[0].derivedView!.rows.find(r=>r.rowKey==='everyday_sum')).toMatchObject({state:'redacted',value:null})
 native.policies.everyday=structuredClone(policy)
 native.policies.everyday.disclosure.audiences.subject!.individualInterpretations=false
 const noInterpretation=computeSurveyNativeReports(snapshot,result)[0].derivedViews!.student!
 expect(noInterpretation.rows.find(r=>r.rowKey==='everyday_sum')).toMatchObject({state:'present',value:36})
 expect(noInterpretation.conclusions.some(c=>c.ruleId==='everyday_record')).toBe(false)
 native.policies.everyday.disclosure.audiences.subject!.numericScores=false
 expect(computeSurveyNativeReports(snapshot,result)[0].derivedViews!.student!.rows.find(r=>r.rowKey==='everyday_sum')).toMatchObject({state:'redacted',value:null})
 native.policies.everyday={...policy,disposition:'UNKNOWN'}
 expect(computeSurveyNativeReports(snapshot,result)[0].derivedViews!.student!.rows.find(r=>r.rowKey==='everyday_sum')).toMatchObject({state:'redacted',value:null})
 native.reportAudiences.everyday=null
 expect(surveyNativeFeedbackAudience(native,'everyday',definition)).toBeNull()
 expect(canonicalHash(definition)).toBe(original)
})
