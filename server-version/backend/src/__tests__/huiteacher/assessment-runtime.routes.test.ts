import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import express from 'express'
import type {Server} from 'node:http'
import type {AddressInfo} from 'node:net'
const mocks=vi.hoisted(()=>{
 // Synthetic, process-local fixture key. No external key or service is used.
 process.env.DATA_ENCRYPTION_KEY='b'.repeat(64)
 return {query:vi.fn(),principal:vi.fn(),start:vi.fn(),consent:vi.fn(),parent:vi.fn(),cognitive:vi.fn(),cognitiveFinal:vi.fn(),
  parentConsent:vi.fn(),childConsent:vi.fn(),sjt:vi.fn(),sjtFinal:vi.fn(),formFinal:vi.fn(),scaleFinal:vi.fn(),media:vi.fn()}
})
vi.mock('../../config/database',()=>({prisma:{$queryRaw:mocks.query}}))
vi.mock('../../modules/organization/principal',async original=>({...await original<object>(),loadCurrentPrincipal:mocks.principal}))
vi.mock('../../utils/sessionRevocation',()=>({isSessionRevoked:async()=>false}))
vi.mock('../../modules/campus/mfa.service',()=>({schoolAccountNeedsMfa:async()=>false}))
vi.mock('../../modules/admin-permissions/security',()=>({needsAdminKey:()=>false,validAdminProof:()=>false,ADMIN_STEP_UP_SECONDS:300}))
vi.mock('../../modules/assessment-run/startExecution',()=>({startAssessmentRunExecution:mocks.start}))
vi.mock('../../modules/assessment-run/consent',()=>({acceptRunExecutionConsent:mocks.consent}))
vi.mock('../../modules/assessment-relational/runtime-consent',()=>({relationalRuntimeConsentAuthority:{assertCompositeFinal:mocks.parentConsent,assertCognitiveFinal:mocks.childConsent}}))
vi.mock('../../modules/composite/composite.service',()=>({getAttemptState:mocks.parent}))
vi.mock('../../modules/composite/composite.controller',()=>({compositeController:{submitFinalFormSection:mocks.formFinal,submitFinalScale:mocks.scaleFinal,embeddedSituationalAsset:mocks.media}}))
vi.mock('../../modules/composite/composite-image.controller',()=>({compositeImageController:{authenticatedFormImage:mocks.media,authenticatedScaleImage:mocks.media}}))
vi.mock('../../modules/composite/composite-video.controller',()=>({compositeVideoController:{authenticatedFormVideo:mocks.media,authenticatedScaleVideo:mocks.media}}))
vi.mock('../../modules/cognitive/session.service',()=>({getSession:mocks.cognitive}))
vi.mock('../../modules/cognitive/final-submit.service',()=>({submitCognitiveSessionFinalWithContext:mocks.cognitiveFinal}))
vi.mock('../../modules/cognitive/cognitive-image.controller',()=>({cognitiveImageController:{content:mocks.media}}))
vi.mock('../../modules/cognitive/cognitive-video.controller',()=>({cognitiveVideoController:{issue:mocks.media}}))
vi.mock('../../modules/situational/situational-runtime.service',()=>({loadEmbeddedSituationalAttemptRuntime:mocks.sjt,situationalAttemptForResponse:(row:unknown)=>row}))
vi.mock('../../modules/situational/situational-final-submit.service',()=>({submitSituationalAttemptFinal:mocks.sjtFinal}))
vi.mock('../../modules/situational/situational-video.controller',()=>({situationalVideoController:{embeddedAuthenticated:mocks.media}}))

import {createTeacherAssessmentRuntimeRouter,projectTeacherCognitiveRuntime,projectTeacherSituationalRuntime} from '../../modules/huiteacher/assessmentRuntime.routes'
import {createTeacherAssessmentAccess} from '../../modules/huiteacher/assessmentRuntime.access'
import {EducationAssessmentSourceError} from '../../modules/education-tools/assessment-resource.repository'
import {draftEducationAssessmentEntry} from '../../modules/education-tools/assessment-resource.contract'
import {relationalEntryToRunPolicy} from '../../modules/assessment-run/resourceAuthority'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {createFrozenActiveSlotSet,encryptFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'
import {generateToken} from '../../utils/jwt'
import {UserRole} from '../../types'
import {testDisclosure} from '../assessment-policy/result-disclosure.fixture'

// SYNTHETIC contracts: real Express/auth/cookie audience/parser and SQL builder;
// source grant, query results and canonical runtime services are fixtures.
// These assertions do not prove PostgreSQL constraints, FINAL durability or races.
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const actor=id(1),attempt=id(8),item=id(6),session=id(9),sjtItem=id(16),sjtChild=id(19)
const origin={schemaVersion:1 as const,adapterVersion:'1.0.0' as const,resourceId:id(2),product:'TEACHER' as const,organizationId:id(3),family:'BUNDLE' as const,
 sourceCompositeId:id(4),runtimeCompositeId:id(5),sourceSnapshotHash:'b'.repeat(64),runtimeSnapshotHash:'c'.repeat(64),
 runtimeDefinitionHash:'1'.repeat(64),distribution:{actorId:actor,grants:[{resourceId:id(4),grantId:id(31),version:1}]},
 units:[{itemId:item,family:'COGNITIVE' as const,measurement:{releaseId:id(7),contentHash:'a'.repeat(64),measurementHash:'d'.repeat(64)},references:[],report:null},
 {itemId:sjtItem,family:'SJT' as const,measurement:{releaseId:id(17),contentHash:'e'.repeat(64),measurementHash:'f'.repeat(64)},references:[],report:null}]}
const entry={...draftEducationAssessmentEntry({origin,title:'Synthetic Teacher mixed delivery',disclosure:testDisclosure()}),releaseStatus:'PUBLISHED' as const}
const policy=relationalEntryToRunPolicy(entry)
const compiledHash='9'.repeat(64)
const frozen=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[
 {slotKey:'cognitive:'+item,unitType:'COGNITIVE',required:true,sourceDefinitionIdentity:{key:'fixture',version:'1',hash:'d'.repeat(64)},sourceBinding:{compositeItemId:item,compiledRuntimeHash:compiledHash}},
 {slotKey:'situational:'+sjtItem,unitType:'SITUATIONAL',required:true,sourceDefinitionIdentity:{key:'fixture',version:'1',hash:'d'.repeat(64)},sourceBinding:{compositeItemId:sjtItem,compiledRuntimeHash:compiledHash},
  runtimeIdentity:{instrumentKey:'fixture',instrumentVersion:'1',definitionHash:'d'.repeat(64),compiledRuntimeHash:compiledHash,scorerKey:'fixture',scoringVersion:'1',runtimeGeneration:'UNIFIED_V1',deliveryMode:'FINAL_ONLY',frozenAt:'2026-10-27T00:00:00Z'}},
]})
const baseline={executionId:id(10),organizationId:origin.organizationId,runId:id(11),eventId:id(12),eventTitle:'Synthetic event',family:'BUNDLE',status:'STARTED',runStatus:'PUBLISHED',
 runtimeBindingRef:attempt,resourceKey:entry.applicability.resourceKey,resourceVersion:'1.0.0',policy,policyHash:canonicalHash(policy),assignmentId:id(13),episodeId:id(14),bindingKind:'COMPOSITE',
 consentRequired:false,consentPurpose:null,consentVisibility:null,cursorCreatedAt:'2026-10-27T10:00:00.123456Z',
 attemptEpoch:1,frozenSlotSet:encryptFrozenActiveSlotSet(frozen),frozenSlotSetHash:frozen.snapshotHash}
let row:{[key:string]:unknown},principal:{[key:string]:unknown},server:Server|undefined
const source={readIdentity:vi.fn(),assertUse:vi.fn()}
const cognitivePayload={sessionId:session,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',config:{trialCount:1},randomSeed:'seed',definitionHash:'d'.repeat(64),
 reportDefinition:{secret:'not a runtime report'},metricDefinitions:{secret:7},result:{secret:99},trainingPersistence:{attemptId:'training'}}
const sjtPayload={attemptId:sjtChild,attempt:{id:sjtChild,status:'IN_PROGRESS',attemptEpoch:1,definitionHash:'d'.repeat(64)},
 instrument:{key:'fixture',version:'1',definition:{scenes:[]},report:{secret:'report'},referencePolicy:{secret:'reference'}},result:{secret:42},canonicalResult:{secret:9}}
const cookie=(product:'HUITEACHER'|'SCHOOL'|'TRAINING'='HUITEACHER',name='huiteacher_session')=>name+'='+generateToken({
 userId:actor,username:'synthetic-teacher',role:UserRole.TEACHER,tokenVersion:1,accountDomain:product==='TRAINING'?'TRAINING':'SCHOOL',
 ...(product==='HUITEACHER'?{sessionProduct:'HUITEACHER' as const}:{}),
})
async function request(path:string,method='GET',body?:unknown,credential=cookie()){
 if(!server){
  const app=express();app.use(express.json());app.use('/api/huiteacher',createTeacherAssessmentRuntimeRouter(source))
  app.get('/api/huiteacher/existing-public-route',(_req,res)=>res.json({existing:true}))
  app.use((error:Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(500).json({message:error.message}))
  server=await new Promise<Server>(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener))})
 }
 const response=await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/huiteacher`+path,{
  method,headers:{cookie:credential,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),
 })
 const text=await response.text()
 return {status:response.status,headers:response.headers,body:response.headers.get('content-type')?.includes('application/json')?JSON.parse(text):{text}}
}
const parentPath='/assessment-composite-attempts/'+attempt
const cognitivePath=parentPath+'/items/'+item+'/cognitive/'+session
const sjtPath=parentPath+'/items/'+sjtItem+'/situational/'+sjtChild
const final={submissionId:'synthetic-final-submission-0001',attemptEpoch:1,definitionHash:'d'.repeat(64),trials:[{synthetic:true}]}
beforeEach(()=>{
 vi.clearAllMocks()
 row={...baseline};principal={userId:actor,username:'synthetic-teacher',accountDomain:'SCHOOL',role:'TEACHER',platformRole:'STANDARD',tokenVersion:1,
  mustChangePassword:false,isActive:true,isFrozen:false,expiresAt:null,teacherApproved:true}
 mocks.principal.mockImplementation(async()=>principal)
 source.readIdentity.mockResolvedValue({origin,entry,identityOnly:true});source.assertUse.mockResolvedValue(undefined)
 mocks.parentConsent.mockResolvedValue(undefined);mocks.childConsent.mockResolvedValue(undefined)
 mocks.query.mockImplementation(async(query:{sql:string;values:unknown[]})=>{
  if(query.values.includes(id(99)))return []
  return query.sql.includes('SELECT slot.id')?[{id:item,compiledRuntimeHash:compiledHash,definitionHash:'d'.repeat(64)}]:[row]
 })
 mocks.cognitive.mockResolvedValue(cognitivePayload)
 mocks.cognitiveFinal.mockResolvedValue({data:{replayed:false,result:{secret:99}}})
 mocks.sjt.mockResolvedValue({row:sjtPayload,snapshot:{}});mocks.sjtFinal.mockResolvedValue({...sjtPayload,replayed:false})
 mocks.parent.mockResolvedValue({id:attempt,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',currentItem:null})
 mocks.media.mockImplementation(async(_req,res)=>res.json({code:0,data:{fixture:'media'}}))
})
afterEach(async()=>{if(server){await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));server=undefined}})

describe('Teacher assessment runtime synthetic HTTP boundary',()=>{
 it('does not intercept the authentication policy of unrelated Teacher routes',async()=>{
  expect((await request('/existing-public-route','GET',undefined,'')).body).toEqual({existing:true})
  expect(mocks.principal).not.toHaveBeenCalled();expect(mocks.query).not.toHaveBeenCalled()
 })
 it('accepts only a Teacher product credential and a current Teacher account',async()=>{
  for(const credential of [cookie('SCHOOL','huischool_session'),cookie('TRAINING','ptool_session'),cookie('SCHOOL'),cookie('TRAINING')]){
   expect((await request(cognitivePath,'GET',undefined,credential)).status).toBe(401)
  }
  expect(mocks.query).not.toHaveBeenCalled()
  principal.role='STUDENT';expect((await request(cognitivePath)).status).toBe(404)
  principal.role='TEACHER';principal.isFrozen=true;expect((await request(cognitivePath)).status).toBe(401)
  expect(mocks.cognitive).not.toHaveBeenCalled()
 })
 it('reads the exact bound Cognitive session while omitting reports and Training persistence',async()=>{
  const response=await request(cognitivePath)
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.body.data).toMatchObject({sessionId:session,status:'IN_PROGRESS',config:{trialCount:1},feedbackDeferred:true})
  for(const key of ['result','reportDefinition','metricDefinitions','trainingPersistence'])expect(response.body.data).not.toHaveProperty(key)
  expect(source.assertUse).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({executionId:baseline.executionId,actorUserId:actor,purpose:'BOUND_COLLECTION'}))
  const sql=mocks.query.mock.calls[0][0].sql
  for(const predicate of ["org.product_domain='SCHOOL'","entitlement.product='HUITEACHER'","a.relationship_kind='SELF'","a.perspective='SELF_REPORT'",
   "a.analysis_mode='INDIVIDUAL_ONLY'","parent.assignment_ref=a.id","parent.episode_id=a.episode_id",'huiteacher_evaluation_events','organization_access_denies'])expect(sql).toContain(predicate)
 })
 it.each(['COGNITIVE','SITUATIONAL'] as const)('supports a dedicated %s delivery through its own frozen parent',async family=>{
  const unit=origin.units[family==='COGNITIVE'?0:1],singleOrigin={...origin,family,units:[unit]}
  const singleEntry={...draftEducationAssessmentEntry({origin:singleOrigin,title:'Synthetic single delivery',disclosure:testDisclosure()}),releaseStatus:'PUBLISHED' as const}
  const singlePolicy=relationalEntryToRunPolicy(singleEntry),singleFrozen=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,
   slots:frozen.slots.filter(slot=>slot.unitType===family)})
  row={...baseline,family,policy:singlePolicy,policyHash:canonicalHash(singlePolicy),frozenSlotSet:encryptFrozenActiveSlotSet(singleFrozen),frozenSlotSetHash:singleFrozen.snapshotHash}
  source.readIdentity.mockResolvedValue({origin:singleOrigin,entry:singleEntry,identityOnly:true})
  expect((await request(family==='COGNITIVE'?cognitivePath:sjtPath)).status).toBe(200)
 })
 it('rejects foreign parent, item and session before any runtime or asset handler',async()=>{
  for(const path of [cognitivePath.replace(attempt,id(99)),cognitivePath.replace(item,id(99)),cognitivePath.replace(session,id(99)),
   cognitivePath.replace(session,id(99))+'/assets/'+id(40)+'/content',sjtPath.replace(sjtChild,id(99)),sjtPath.replace(sjtItem,id(99))+'/scenes/one/video-sources']){
   expect((await request(path)).status).toBe(404)
  }
  expect(mocks.cognitive).not.toHaveBeenCalled();expect(mocks.sjt).not.toHaveBeenCalled();expect(mocks.media).not.toHaveBeenCalled()
 })
 it('requires independent source-use authorization; identity alone cannot pass',async()=>{
  source.assertUse.mockRejectedValue({statusCode:403,code:'SOURCE_GRANT_REVOKED'})
  expect((await request(cognitivePath)).status).toBe(403)
  expect(mocks.cognitive).not.toHaveBeenCalled()
 })
 it('uses root NEW_USE for new assignments and HISTORY for exact bound continuation',async()=>{
  await request(cognitivePath)
  expect(source.readIdentity).toHaveBeenLastCalledWith(expect.anything(),{resourceKey:baseline.resourceKey,version:'1.0.0',purpose:'HISTORY'})
  row={...baseline,status:'ASSIGNED',runtimeBindingRef:null,bindingKind:null}
  await request('/my-assessment-tasks')
  expect(source.readIdentity).toHaveBeenLastCalledWith(expect.anything(),{resourceKey:baseline.resourceKey,version:'1.0.0',purpose:'NEW_USE'})
 })
 it('rejects mismatched organization, frozen policy hash and runtime target',async()=>{
  for(const changed of [{organizationId:id(99)},{policyHash:'0'.repeat(64)},{policy:{...policy,runtimeLaunchTarget:{kind:'COMPOSITE',ref:origin.sourceCompositeId}}}]){
   row={...baseline,...changed};expect((await request(parentPath)).status).toBe(404)
  }
  expect(mocks.parent).not.toHaveBeenCalled()
 })
 it('rejects stale frozen epochs, tampered slot hashes and foreign compiled runtimes',async()=>{
  for(const changed of [{attemptEpoch:2},{frozenSlotSetHash:'0'.repeat(64)},{frozenSlotSet:'invalid'}]){
   row={...baseline,...changed};expect((await request(cognitivePath)).status).toBe(404)
  }
  row={...baseline}
  mocks.query.mockImplementation(async(query:{sql:string})=>query.sql.includes('SELECT slot.id')?[{id:item,compiledRuntimeHash:'0'.repeat(64),definitionHash:'d'.repeat(64)}]:[row])
  expect((await request(cognitivePath)).status).toBe(404);expect((await request(sjtPath)).status).toBe(404)
  expect(mocks.cognitive).not.toHaveBeenCalled();expect(mocks.sjt).not.toHaveBeenCalled()
 })
 it('keeps shared consent authority before materials, child reads and FINAL',async()=>{
  mocks.parentConsent.mockRejectedValue({statusCode:403,code:'RELATIONAL_CONSENT_REQUIRED'})
  for(const [path,method,body] of [[cognitivePath,'GET',undefined],[cognitivePath+'/assets/'+id(40)+'/content','GET',undefined],
   [cognitivePath+'/submit','POST',final]] as const)expect((await request(path,method,body)).status).toBe(403)
  expect(mocks.cognitive).not.toHaveBeenCalled();expect(mocks.media).not.toHaveBeenCalled();expect(mocks.cognitiveFinal).not.toHaveBeenCalled()
 })
 it('forwards one-shot Cognitive FINAL and its replay to the canonical service without scores',async()=>{
  mocks.cognitiveFinal.mockResolvedValueOnce({data:{replayed:false,result:{secret:9}}}).mockResolvedValueOnce({data:{replayed:true,result:{secret:9}}})
  const first=await request(cognitivePath+'/submit','POST',final),replay=await request(cognitivePath+'/submit','POST',final)
  expect(first.body.data).toEqual({completed:true,replayed:false,feedbackDeferred:true})
  expect(replay.body.data).toEqual({completed:true,replayed:true,feedbackDeferred:true})
  expect(mocks.cognitiveFinal.mock.calls).toEqual([[actor,{sessionId:session,...final}],[actor,{sessionId:session,...final}]])
  expect((await request(cognitivePath+'/submit','POST',{...final,score:100})).status).toBe(400)
  expect((await request(cognitivePath+'/trials','POST',{})).status).toBe(404)
 })
 it('resumes the original bound parent without calling new-intake START, including CLOSED Run',async()=>{
  row.runStatus='CLOSED'
  const response=await request('/run-executions/'+baseline.executionId+'/start-assessment','POST',{})
  expect(response.body.data).toEqual({state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:attempt,replayed:true})
  expect(mocks.start).not.toHaveBeenCalled();expect(mocks.parentConsent).toHaveBeenCalledWith(attempt,actor)
 })
 it('uses canonical START and then verifies its persisted exact binding',async()=>{
  row={...baseline,status:'ASSIGNED',runtimeBindingRef:null,bindingKind:null}
  mocks.start.mockImplementation(async()=>{row={...baseline};return {state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:attempt,replayed:false}})
  expect((await request('/run-executions/'+baseline.executionId+'/start-assessment','POST',{})).status).toBe(200)
  expect(mocks.start).toHaveBeenCalledWith({executionId:baseline.executionId,actorUserId:actor})
  expect(source.assertUse.mock.calls.map(call=>call[1].purpose)).toEqual(['START','BOUND_COLLECTION'])
 })
 it('projects SJT resume and FINAL as runner state plus completion, with no report',async()=>{
  const response=await request(sjtPath)
  expect(response.status).toBe(200);expect(response.body.data).toMatchObject({attemptId:sjtChild,feedbackDeferred:true})
  for(const key of ['result','canonicalResult','instrument.report','instrument.referencePolicy'])expect(response.body.data).not.toHaveProperty(key)
  const payload={submissionId:'synthetic-sjt-final-0001',attemptEpoch:1,definitionHash:'d'.repeat(64),responses:[{sceneKey:'s',channelKey:'c',responseValue:'a'}]}
  const submitted=await request(sjtPath+'/submit','POST',payload)
  expect(submitted.status).toBe(200);expect(submitted.body.data).not.toHaveProperty('result')
  expect(mocks.sjtFinal).toHaveBeenCalledWith(expect.objectContaining({attemptId:sjtChild,userId:actor,
   embedded:{userId:actor,compositeAttemptId:attempt,compositeItemId:sjtItem,compositeSlotKey:'situational:'+sjtItem}}))
 })
 it('exposes an existing completed parent without re-running FINAL or report code',async()=>{
  row={...baseline,status:'COMPLETED'};mocks.parent.mockResolvedValue({id:attempt,status:'COMPLETED',deliveryMode:'FINAL_ONLY',currentItem:null})
  const response=await request(parentPath)
  expect(response.body.data.status).toBe('COMPLETED');expect(source.assertUse).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({purpose:'HISTORY_READ'}))
  expect(mocks.cognitiveFinal).not.toHaveBeenCalled();expect(mocks.sjtFinal).not.toHaveBeenCalled()
 })
 it('binds pagination cursors to the actor and rejects oversized input before SQL',async()=>{
  const db={$queryRaw:vi.fn().mockResolvedValue([{...baseline},{...baseline,executionId:id(21)}])}
  const access=createTeacherAssessmentAccess(db as never,source)
  const page=await access.page(actor,{pageSize:1})
  expect(page.list[0]).not.toHaveProperty('policy');expect(page.nextCursor).toBeTruthy()
  db.$queryRaw.mockClear()
  await expect(access.page(id(99),{cursor:page.nextCursor})).rejects.toMatchObject({statusCode:400})
  await expect(access.page(actor,{pageSize:101})).rejects.toBeDefined()
  expect(db.$queryRaw).not.toHaveBeenCalled()
 })
 it('keeps a cursor for a bounded page containing known unavailable sources',async()=>{
  const db={$queryRaw:vi.fn().mockResolvedValue([{...baseline},{...baseline,executionId:id(21)}])}
  source.readIdentity.mockRejectedValueOnce(new EducationAssessmentSourceError('EDUCATION_ASSESSMENT_RESOURCE_NOT_AVAILABLE'))
  const page=await createTeacherAssessmentAccess(db as never,source).page(actor,{pageSize:1})
  expect(page.list).toEqual([]);expect(page.nextCursor).toBeTruthy()
  expect(db.$queryRaw).toHaveBeenCalledTimes(1)
 })
 it('propagates identity corruption and unknown errors instead of returning an empty task page',async()=>{
  const db={$queryRaw:vi.fn().mockResolvedValue([{...baseline}])},access=createTeacherAssessmentAccess(db as never,source)
  for(const failure of [new EducationAssessmentSourceError('EDUCATION_ASSESSMENT_POLICY_IDENTITY'),{code:'UNKNOWN',statusCode:409},new Error('database unavailable')]){
   source.readIdentity.mockRejectedValueOnce(failure)
   await expect(access.page(actor)).rejects.toBe(failure)
  }
 })
 it('projects completed children to completion-only responses',()=>{
  expect(projectTeacherCognitiveRuntime({...cognitivePayload,status:'COMPLETED'})).toEqual(expect.objectContaining({status:'COMPLETED',feedbackDeferred:true}))
  expect(projectTeacherCognitiveRuntime({...cognitivePayload,status:'COMPLETED'})).not.toHaveProperty('config')
  expect(projectTeacherSituationalRuntime({...sjtPayload,replayed:true})).not.toHaveProperty('canonicalResult')
 })
})
