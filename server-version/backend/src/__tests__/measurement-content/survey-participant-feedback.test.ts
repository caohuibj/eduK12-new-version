import {beforeEach,describe,expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {freezeSurveyParticipantFeedback,rawParticipantFeedback,surveyRawFeedbackSchema} from '../../modules/survey/participant-feedback'
import {readGeneralForOwnAttempt} from '../../modules/survey/final.service'
import type {ResearchFrozenUnit} from '../../modules/survey/publication.service'
import type {FrozenUnitResult} from '../../modules/survey/final.compute'
const mocks=vi.hoisted(()=>({verified:vi.fn(),transaction:vi.fn(),lock:vi.fn(),attempt:vi.fn(),person:vi.fn(),consent:vi.fn(),final:vi.fn(),legacy:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction,surveyWaveFinal:{findFirst:mocks.legacy}}}))
vi.mock('../../modules/survey/admission.service',()=>({verifiedSurveyAttempt:mocks.verified}))
vi.mock('../../modules/survey/identity.service',()=>({hashResearchCredential:()=> 'credential'}))
vi.mock('../../modules/assessment-runtime/security',()=>({decryptUnifiedRuntimePayload:JSON.parse}))
const draftId='00000000-0000-4000-8000-000000000001'
const policy=()=>({policyVersion:'SURVEY_RAW_METRICS_V1' as const,mode:'DESCRIPTIVE' as const,metricKeys:['safe'],release:'AFTER_FINAL' as const})
const unit=(kind:'SCALE'|'SJT'='SCALE'):ResearchFrozenUnit=>({draftId,instrumentKey:'instrument',kind,title:'Title',draftRevision:1,
 sourceDigest:'source',scoringDigest:'scoring',compiledDefinition:{scoring:{scores:[{key:'safe'},{key:'private'}],publishedMetrics:[{key:'safe'},{key:'private'}]}},displayDefinition:{},
 measurementRelease:{releaseId:'measurement',contentHash:'content',measurementHash:'measurement-hash'},participantFeedback:policy()})
const stored=(kind:'SCALE'|'SJT'='SCALE'):FrozenUnitResult=>({instrumentKey:'instrument',kind,sourceDigest:'source',scoringDigest:'scoring',rawAnswers:{secret:'answer'},missing:[],
 privateScoring:{[kind==='SCALE'?'scores':'metrics']:[{key:'safe',value:7,status:'calculated',privateDetail:'hidden'},{key:'private',value:99,status:'calculated'}],quality:{status:'interpretable',secret:'hidden'}}})
const proof={publicId:'public',attemptId:'attempt',accessCredential:'token'}
let activeUnit:ResearchFrozenUnit,attempt:any,result:any,final:any
beforeEach(()=>{
 vi.clearAllMocks();activeUnit=unit();attempt={status:'COMPLETED',excludedAt:null,participantId:null,sessionHash:'credential',wave:{consentVersion:1,generalText:'Thanks',finishUntil:new Date(Date.now()+3600000),closesAt:null,hardStopAt:null}}
 result={schemaVersion:1,definitionDigest:'digest',units:[stored()]}
 final={definitionDigest:'digest',resultsCipher:JSON.stringify(result),resultsHash:canonicalHash(result),completedAt:new Date()}
 mocks.verified.mockImplementation(async()=>({projectId:'project',waveId:'wave',attemptId:'attempt',participantId:attempt.participantId,definitionDigest:'digest',status:'COMPLETED',generalText:'Thanks',compiledSnapshot:{units:[activeUnit]}}))
 mocks.attempt.mockImplementation(async()=>attempt);mocks.person.mockResolvedValue({id:'person'});mocks.consent.mockResolvedValue({id:'consent'});mocks.final.mockImplementation(async()=>final)
 mocks.legacy.mockResolvedValue({definitionDigest:'digest',completedAt:new Date()})
 mocks.transaction.mockImplementation(async(fn:any)=>fn({$queryRaw:mocks.lock,surveyWaveAttempt:{findFirst:mocks.attempt},surveyParticipant:{findFirst:mocks.person},surveyConsent:{findFirst:mocks.consent},surveyWaveFinal:{findUnique:mocks.final}}))
})
describe('explicit frozen participant raw metric policy',()=>{
 it('defaults off and validates explicit unique allowlist and mode',()=>{
  expect(surveyRawFeedbackSchema.parse({policyVersion:'SURVEY_RAW_METRICS_V1'})).toMatchObject({mode:'GENERAL',metricKeys:[]})
  for(const change of [{metricKeys:[]},{metricKeys:['safe','safe']},{mode:'GENERAL'},{template:{}},{release:'NOW'}])
   expect(()=>surveyRawFeedbackSchema.parse({...policy(),...change})).toThrow()
 })
 it('freezes only selected Scale/SJT release metrics and leaves measurement identity untouched',()=>{
  for(const kind of ['SCALE','SJT'] as const){
   const u=unit(kind);delete u.participantFeedback;const hash=canonicalHash(u.compiledDefinition)
   freezeSurveyParticipantFeedback([u],[{instrumentId:draftId,feedback:policy()}],new Map([[draftId,['safe','private']]]))
   expect(u.participantFeedback).toEqual(policy());expect(canonicalHash(u.compiledDefinition)).toBe(hash)
  }
  const u=unit();delete u.participantFeedback
  freezeSurveyParticipantFeedback([u],[],new Map());expect(u.participantFeedback).toBeUndefined()
  for(const bad of [{...unit(),kind:'COGNITIVE'}, {...unit(),kind:'FORM'}, {...unit(),measurementRelease:undefined}])
   expect(()=>freezeSurveyParticipantFeedback([bad as ResearchFrozenUnit],[{instrumentId:draftId,feedback:policy()}],new Map([[draftId,['safe']]]))).toThrow()
  expect(()=>freezeSurveyParticipantFeedback([unit()],[{instrumentId:draftId,feedback:{...policy(),metricKeys:['unknown']}}],new Map([[draftId,['safe']]]))).toThrow()
 })
 it.each(['SCALE','SJT'] as const)('projects only explicitly allowed stored %s values, with no private/template/reference data',kind=>{
  expect(rawParticipantFeedback(unit(kind),stored(kind),true)).toEqual({pending:false,instrumentKey:'instrument',title:'Title',measurementReleaseId:'measurement',metrics:[{key:'safe',label:'safe',value:7,unit:null,status:'OK'}],quality:'interpretable'})
 })
 it('denies unknown policy keys, wrong source identity, missing quality and noninterpretable/noncalculated/nonfinite values',()=>{
  expect(()=>rawParticipantFeedback({...unit(),participantFeedback:{...policy(),metricKeys:['unknown']}},stored(),true)).toThrow()
  expect(()=>rawParticipantFeedback(unit(),{...stored(),sourceDigest:'other'},true)).toThrow()
  for(const privateScoring of [null,{scores:[{key:'safe',value:7,status:'calculated'}]},
   ...['limited','invalid','unknown'].map(status=>({scores:[{key:'safe',value:7,status:'calculated'}],quality:{status}})),
   ...['limited','not_calculable'].map(status=>({scores:[{key:'safe',value:7,status}],quality:{status:'interpretable'}})),
   {scores:[{key:'safe',value:NaN,status:'calculated'}],quality:{status:'interpretable'}}])
   expect(rawParticipantFeedback(unit(),{...stored(),privateScoring},true)).toBeNull()
  expect(rawParticipantFeedback(unit(),{...stored(),notExecuted:true},true)).toBeNull()
 })
})
describe('participant general route current authorization and frozen timing',()=>{
 it('keeps legacy GENERAL without opt-in and does not read private results',async()=>{
  delete activeUnit.participantFeedback
  expect(await readGeneralForOwnAttempt(proof)).toMatchObject({kind:'GENERAL_ONLY'})
  expect(mocks.transaction).not.toHaveBeenCalled();expect(mocks.final).not.toHaveBeenCalled()
 })
 it('uses existing locked credential/consent branch for explicit Scale feedback',async()=>{
  const response=await readGeneralForOwnAttempt(proof)
  expect(response).toMatchObject({kind:'DESCRIPTIVE',pending:false,measurements:[{metrics:[{key:'safe',value:7}]}]})
  expect(mocks.lock).toHaveBeenCalledTimes(3);expect(mocks.consent).toHaveBeenCalledTimes(1)
  expect(mocks.legacy).not.toHaveBeenCalled();expect(JSON.stringify(response)).not.toMatch(/privateDetail|rawAnswers|reference|template|99/)
 })
 it('preserves AFTER_COLLECTION pending and releases only at existing collection boundary',async()=>{
  activeUnit.participantFeedback={...policy(),release:'AFTER_COLLECTION'}
  expect(await readGeneralForOwnAttempt(proof)).toMatchObject({kind:'DESCRIPTIVE',pending:true,measurements:[]})
  attempt.wave.finishUntil=new Date(0)
  expect(await readGeneralForOwnAttempt(proof)).toMatchObject({kind:'DESCRIPTIVE',pending:false,measurements:[{metrics:[{value:7}]}]})
 })
 it.each(['withdrawn','credential','consent','linked revoked','incomplete','hash'])('refuses current %s before disclosure',async(reason)=>{
  if(reason==='withdrawn')attempt.excludedAt=new Date()
  if(reason==='credential')attempt.sessionHash='changed'
  if(reason==='consent')mocks.consent.mockResolvedValue(null)
  if(reason==='linked revoked'){attempt.participantId='person';mocks.person.mockResolvedValue(null)}
  if(reason==='incomplete')attempt.status='STARTED'
  if(reason==='hash')final.resultsHash='tampered'
  await expect(readGeneralForOwnAttempt(proof)).rejects.toThrow()
 })
})

import {compileFrozenResearchUnit,surveyMeasurementReleaseInput,type ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {verifySurveyFinalPublication} from '../../modules/survey/final.compute'
import {prepareRelease} from '../../modules/measurement-content/release'
const realScale={schemaVersion:1,respondentType:'participant_self_report',aggregation:'sum',responseOptions:[
 {optionKey:'yes',label:'Yes',score:3},{optionKey:'no',label:'No',score:0}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
 items:[{itemKey:'one',prompt:'Question',required:true,reverse:false,dimensionKeys:['total']}]}
const realSjtV1={schemaVersion:1,respondentType:'student_self_report',scenarioKey:'classroom',title:'Scene',stimulus:'Discuss with classmates.',
 author:'Researcher',sourceNote:'Local authored',licenseStatus:'self_authored',redistribution:'allowed',metrics:[{metricKey:'effort',label:'Effort',direction:'descriptive'}],
 questions:[{questionKey:'first',prompt:'What first?',options:[{optionKey:'try',label:'Try',contributions:{effort:2}},{optionKey:'wait',label:'Wait',contributions:{effort:0}}]},
 {questionKey:'second',prompt:'What next?',options:[{optionKey:'talk',label:'Talk',contributions:{effort:2}},{optionKey:'leave',label:'Leave',contributions:{effort:0}}]}]}
const realSjtV2={schemaVersion:2,respondentType:'participant_self_report',title:'Multiple scenes',author:'Researcher',sourceNote:'Local authored',
 licenseStatus:'self_authored',redistribution:'allowed',orderPolicy:'FIXED',metrics:[{metricKey:'effort',label:'Effort',direction:'descriptive'}],
 scoring:{modelKey:'AUTHOR_KEY_SUM',modelVersion:'1',sourceNote:''},scenes:[
 {sceneKey:'first_scene',title:'First',stimulus:'A group is discussing.',questions:[{questionKey:'first',prompt:'What first?',responseType:'SINGLE',required:true,allowRefusal:false,
 options:[{optionKey:'try',label:'Try',contributions:{effort:2}},{optionKey:'wait',label:'Wait',contributions:{effort:0}}]}]},
 {sceneKey:'second_scene',title:'Second',stimulus:'The group plans its next step.',questions:[{questionKey:'second',prompt:'What next?',responseType:'SINGLE',required:true,allowRefusal:false,
 options:[{optionKey:'talk',label:'Talk',contributions:{effort:2}},{optionKey:'leave',label:'Leave',contributions:{effort:0}}]}]}]}
describe('actual compiler → verified FINAL computation → participant projection',()=>{
 it.each(['SCALE','SJT_V1','SJT_V2'] as const)('discloses only the permitted saved %s raw metric with real structures',family=>{
  const kind=family==='SCALE'?'SCALE':'SJT',definition=family==='SCALE'?realScale:family==='SJT_V1'?realSjtV1:realSjtV2
  const frozen=compileFrozenResearchUnit({id:draftId,instrumentKey:'tool',kind,title:'Test',revision:1,definition})
  const release=prepareRelease(surveyMeasurementReleaseInput(frozen,'owner','project'))
  if(release.layer!=='MEASUREMENT')throw new Error('Expected measurement')
  frozen.measurementRelease={releaseId:'real-measurement',contentHash:release.contentHash,measurementHash:release.content.measurementHash}
  const key=family==='SCALE'?'total':'effort'
  freezeSurveyParticipantFeedback([frozen],[{instrumentId:draftId,feedback:{...policy(),metricKeys:[key]}}],
    new Map([[draftId,release.content.metrics.map(metric=>metric.metricKey)]]))
  const snapshot:ResearchFrozenPublication={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'project',waveId:'wave',collectionMode:'SINGLE_UNLINKED',consentVersion:1,
   linkageNoticeConfirmed:false,consentDigest:'consent',runtimeStatus:'SURVEY_FINAL_V1',units:[frozen]}
  const calculated=verifySurveyFinalPublication(snapshot,canonicalHash(snapshot))!.compute(
   {tool:family==='SCALE'?{one:'yes'}:{first:'try',second:'talk'}},null,[],'FINAL')
  const actual=calculated.units[0],before=JSON.stringify(actual)
  const privateResult=actual.privateScoring as {scores?:Array<{key:string;value:number;status:string}>;metrics?:Array<{key:string;value:number;status:string}>;quality:{status:string}}
  const actualMetrics=family==='SCALE'?privateResult.scores!:privateResult.metrics!
  expect(actualMetrics.find(metric=>metric.key===key)).toMatchObject({value:family==='SCALE'?3:4,status:'calculated'})
  expect(privateResult.quality.status).toBe('interpretable')
  const projected=rawParticipantFeedback(frozen,actual,true)
  expect(projected).toMatchObject({pending:false,metrics:[{key,value:family==='SCALE'?3:4,status:'OK'}]})
  expect(JSON.stringify(actual)).toBe(before)
  expect(JSON.stringify(projected)).not.toMatch(/rawAnswers|contributions|questionResults|modelKey|publishedMetrics/)
  for(const status of ['limited','invalid']){
   const changed={...actual,privateScoring:{...privateResult,quality:{...privateResult.quality,status}}}
   expect(rawParticipantFeedback(frozen,changed,true)).toBeNull()
  }
 })
})
