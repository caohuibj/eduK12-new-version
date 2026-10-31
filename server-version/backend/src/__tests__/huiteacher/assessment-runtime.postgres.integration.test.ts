import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import type {AddressInfo} from 'node:net'
import {PrismaClient,Prisma} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {teacherRuntimePgFixture} from './assessment-runtime.postgres.fixture'
import {createTeacherAssessmentRuntimeRouter} from '../../modules/huiteacher/assessmentRuntime.routes'
import {teacherAssessmentRuntimeSource} from '../../modules/huiteacher/assessmentRuntime.source'
import {csrfProtection} from '../../middleware/csrf'
import {huiteacherOriginGuard} from '../../modules/huiteacher/originGuard'
import {generateToken} from '../../utils/jwt'
import {UserRole} from '../../types'
import {prisma} from '../../config/database'
import {createTrialEnvelope} from '../../modules/cognitive/v2/trial-envelope'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {revokeAdminContentGrant} from '../../modules/measurement-content/admin-authority.service'
import {closeTeacherRun} from '../../modules/huiteacher/run.service'
import {verifyRuntimePrivileges} from '../../../scripts/runtime-role-contract.mjs'

const url=integrationDatabaseUrl('TEACHER_RUNTIME_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
let owner:PrismaClient,server:Server,origin:string
const teacherCookie=(actor:{id:string;username:string;role:string;accountDomain?:string},product:'HUITEACHER'|'SCHOOL'|'TRAINING'='HUITEACHER',copyIntoTeacherCookie=false)=>{
 const name=copyIntoTeacherCookie||product==='HUITEACHER'?'huiteacher_session':product==='SCHOOL'?'huischool_session':'ptool_session'
 return name+'='+generateToken({userId:actor.id,username:actor.username,role:actor.role as UserRole,tokenVersion:0,accountDomain:product==='TRAINING'?'TRAINING':'SCHOOL',
  ...(product==='HUITEACHER'?{sessionProduct:'HUITEACHER' as const}:{})})+'; huiteacher_csrf=pr363-csrf'
}
async function request(path:string,cookie:string,method='GET',body?:unknown,headers:Record<string,string>={}){
 const response=await fetch(origin+'/api/huiteacher'+path,{method,headers:{cookie,Origin:'http://teacher.localhost','Content-Type':'application/json','X-CSRF-Token':'pr363-csrf',...headers},
  ...(body===undefined?{}:{body:JSON.stringify(body)})})
 const text=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?JSON.parse(text):{text}
 return {status:response.status,body:data}
}
function requireSuccess<T=any>(response:{status:number;body:any}):T{
 expect(response.status,JSON.stringify(response.body)).toBe(200)
 expect(response.body.code,JSON.stringify(response.body)).toBe(0)
 return response.body.data as T
}
async function start(f:Awaited<ReturnType<typeof teacherRuntimePgFixture>>){
 const cookie=teacherCookie(f.respondent)
 const started=requireSuccess<{runtimeBindingRef:string}>(await request('/run-executions/'+f.executionId+'/start-assessment',cookie,'POST',{}))
 return {cookie,parentId:started.runtimeBindingRef,parentPath:'/assessment-composite-attempts/'+started.runtimeBindingRef}
}
async function submitCognitive(parentPath:string,item:any,cookie:string){
 const path=parentPath+'/items/'+item.id+'/cognitive/'+item.cognitiveSession.sessionId
 const child=requireSuccess<any>(await request(path,cookie))
 const trials=Array.from({length:child.config.totalTrials},(_,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*3000,
  endedAtPerfMs:trialIndex*3000+400,payload:{foreperiodMs:700+trialIndex*100,rtMs:400,prematureCount:0,interrupted:false,inputMode:'pointer'}}))
 const payload={submissionId:randomUUID(),attemptEpoch:child.attemptEpoch??1,definitionHash:child.definitionHash,contextSnapshotHash:child.contextSnapshotHash??null,trials}
 const result=requireSuccess<any>(await request(path+'/submit',cookie,'POST',payload))
 expect(result).toEqual({completed:true,feedbackDeferred:true,replayed:false})
 return {path,payload,sessionId:child.sessionId}
}
async function submitSjt(parentPath:string,item:any,cookie:string){
 const path=parentPath+'/items/'+item.id+'/situational/'+item.situationalAttemptId
 const child=requireSuccess<any>(await request(path,cookie))
 expect(child.result).toBeUndefined();expect(child.canonicalResult).toBeUndefined()
 const payload={submissionId:randomUUID(),attemptEpoch:child.attempt.attemptEpoch,definitionHash:child.attempt.definitionHash,
  compiledRuntimeHash:child.attempt.compiledRuntimeHash,instrumentVersion:child.attempt.instrumentVersion,scoringVersion:child.attempt.scoringVersion,
  responses:[{sceneKey:'AS-01',channelKey:'behavior',responseValue:'A'},{sceneKey:'AS-02',channelKey:'behavior',responseValue:'B'}]}
 requireSuccess(await request(path+'/submit',cookie,'POST',payload))
 return {path,payload,childId:child.attemptId}
}
/** Actual migrated PostgreSQL + restricted runtime + real Express/auth/CSRF,
 * source reader, issuer checks and canonical engines. Only source production is
 * a documented synthetic owner fixture; no module/service/query mock is used. */
suite('Teacher assessment runtime real PostgreSQL and canonical FINAL',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  if(new URL(url!).pathname!=='/pr363_runtime_test')throw new Error('Dedicated disposable PR363 database required')
  const fixtureUrl=new URL(process.env.TEACHER_RUNTIME_FIXTURE_OWNER_URL??'')
  if(fixtureUrl.hostname!==new URL(url!).hostname||fixtureUrl.pathname!==new URL(url!).pathname)throw new Error('Fixture owner must match exact disposable database')
  owner=new PrismaClient({datasources:{db:{url:fixtureUrl.href}}})
  expect(await verifyRuntimePrivileges(prisma)).toMatchObject({restrictedRuntimeRole:true})
  const app=express();app.use(express.json({limit:'2mb'}));app.use('/api',csrfProtection)
  app.use('/api/huiteacher',huiteacherOriginGuard,createTeacherAssessmentRuntimeRouter(teacherAssessmentRuntimeSource))
  app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(error.statusCode??500).json({code:error.code??'UNEXPECTED',message:error.message}))
  server=await new Promise<Server>(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance))})
  origin='http://127.0.0.1:'+(server.address() as AddressInfo).port
 },60_000)
 afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await owner?.$disconnect();await prisma.$disconnect()})
 it('runs a mixed BUNDLE through actual Teacher guards, restore, Cognitive/SJT/Form FINAL and durable replay',async()=>{
  const f=await teacherRuntimePgFixture(owner),cookie=teacherCookie(f.respondent)
  expect(requireSuccess<any>(await request('/my-assessment-tasks',cookie)).list.some((row:any)=>row.executionId===f.executionId)).toBe(true)
  await owner.user.update({where:{id:f.issuer.id},data:{isFrozen:true}})
  expect((await request('/run-executions/'+f.executionId+'/start-assessment',cookie,'POST',{})).status).toBe(409)
  expect(await owner.compositeAssessmentAttempt.count({where:{compositeAssessmentId:f.runtimeId}})).toBe(0)
  await owner.user.update({where:{id:f.issuer.id},data:{isFrozen:false}})
  const running=await start(f)
  const restored=requireSuccess<any>(await request('/run-executions/'+f.executionId+'/start-assessment',cookie,'POST',{}))
  expect(restored).toMatchObject({runtimeBindingRef:running.parentId,replayed:true})
  let state=requireSuccess<any>(await request(running.parentPath,cookie));expect(state.currentItem.type).toBe('COGNITIVE')
  const cognitivePath=running.parentPath+'/items/'+state.currentItem.id+'/cognitive/'+state.currentItem.cognitiveSession.sessionId
  for(const credential of [teacherCookie(f.respondent,'SCHOOL'),teacherCookie(f.issuer,'TRAINING'),teacherCookie(f.respondent,'SCHOOL',true)])
   expect((await request(cognitivePath,credential)).status).toBe(401)
  expect((await request(cognitivePath,teacherCookie(f.other))).status).toBe(404)
  expect((await request(cognitivePath.replace(state.currentItem.id,randomUUID()),cookie)).status).toBe(404)
  expect((await request(cognitivePath.replace(state.currentItem.cognitiveSession.sessionId,randomUUID()),cookie)).status).toBe(404)
  expect((await request(cognitivePath+'/submit',cookie,'POST',{}, {Origin:'https://training.eduk12.top'})).status).toBe(403)
  expect((await request(cognitivePath+'/submit',cookie,'POST',{}, {'X-CSRF-Token':'wrong'})).status).toBe(403)
  const cognitive=await submitCognitive(running.parentPath,state.currentItem,cookie)
  expect(requireSuccess<any>(await request(cognitive.path+'/submit',cookie,'POST',cognitive.payload))).toMatchObject({replayed:true})
  const conflictingTrials=cognitive.payload.trials.map((trial,index)=>index===0?{...trial,payload:{...trial.payload,prematureCount:1}}:trial)
  expect((await request(cognitive.path+'/submit',cookie,'POST',{...cognitive.payload,trials:conflictingTrials})).status).toBe(409)
  expect(await owner.cognitiveRawSubmission.count({where:{sessionId:cognitive.sessionId}})).toBe(1)
  state=requireSuccess<any>(await request(running.parentPath,cookie));expect(state.status).toBe('IN_PROGRESS');expect(state.currentItem.type).toBe('SITUATIONAL')
  const sjt=await submitSjt(running.parentPath,state.currentItem,cookie)
  const sjtReplay=requireSuccess<any>(await request(sjt.path+'/submit',cookie,'POST',sjt.payload));expect(sjtReplay.replayed).toBe(true);expect(sjtReplay.result).toBeUndefined()
  expect(await owner.situationalRawSubmission.count({where:{attemptId:sjt.childId}})).toBe(1)
  state=requireSuccess<any>(await request(running.parentPath,cookie));expect(state.status).toBe('IN_PROGRESS');expect(state.currentItem.type).toBe('FORM_SECTION')
  const section={id:state.currentItem.formSectionId,definitionHash:state.currentItem.definitionHash,items:state.currentItem.answers}
  expect(section.id).toBeTruthy();expect(Array.isArray(section.items)).toBe(true)
  const payload={submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:section.definitionHash,
   contextSnapshotHash:state.contextSnapshotHash??null,answers:section.items.map((field:any)=>({formItemId:field.id,value:'synthetic note'}))}
  requireSuccess(await request(running.parentPath+'/form-sections/'+section.id+'/submit',cookie,'POST',payload))
  state=requireSuccess<any>(await request(running.parentPath,cookie));expect(state.status).toBe('COMPLETED')
  const [execution]=await owner.$queryRaw<Array<{status:string}>>`SELECT status FROM assessment_run_executions WHERE id=${f.executionId}`
  expect(execution.status).toBe('COMPLETED');expect(await owner.assessmentUnitSnapshot.count({where:{compositeAttemptId:running.parentId}})).toBe(3)
  const raw=await owner.cognitiveRawSubmission.findFirstOrThrow({where:{sessionId:cognitive.sessionId}})
  const hash=canonicalHash({...raw,createdAt:raw.createdAt.toISOString()})
  await owner.$executeRaw(Prisma.sql`UPDATE education_assessment_deliveries SET status='RETIRED',retired_by_user_id=${f.reviewer.id},retired_at=clock_timestamp() WHERE id=${f.resourceId}`)
  await owner.user.update({where:{id:f.issuer.id},data:{isFrozen:true}})
  expect(requireSuccess<any>(await request(running.parentPath,cookie)).status).toBe('COMPLETED')
  expect(requireSuccess<any>(await request(cognitive.path+'/submit',cookie,'POST',cognitive.payload)).replayed).toBe(true)
  const replayRaw=await owner.cognitiveRawSubmission.findFirstOrThrow({where:{sessionId:cognitive.sessionId}})
  expect(canonicalHash({...replayRaw,createdAt:replayRaw.createdAt.toISOString()})).toBe(hash)
  await owner.user.update({where:{id:f.respondent.id},data:{isFrozen:true}})
  expect((await request(running.parentPath,cookie)).status).toBe(401)
 },90_000)
 it('runs a dedicated SJT delivery through actual START, FINAL, parent completion and replay',async()=>{
  const f=await teacherRuntimePgFixture(owner,'SITUATIONAL'),running=await start(f)
  const state=requireSuccess<any>(await request(running.parentPath,running.cookie));expect(state.currentItem.type).toBe('SITUATIONAL')
  const sjt=await submitSjt(running.parentPath,state.currentItem,running.cookie)
  expect(requireSuccess<any>(await request(running.parentPath,running.cookie)).status).toBe('COMPLETED')
  expect(requireSuccess<any>(await request(sjt.path+'/submit',running.cookie,'POST',sjt.payload)).replayed).toBe(true)
  expect(await owner.situationalRawSubmission.count({where:{attemptId:sjt.childId}})).toBe(1)
 },90_000)
 it('runs a dedicated Cognitive family with the production adapter through durable FINAL',async()=>{
  const f=await teacherRuntimePgFixture(owner,'COGNITIVE'),running=await start(f)
  const state=requireSuccess<any>(await request(running.parentPath,running.cookie));expect(state.currentItem.type).toBe('COGNITIVE')
  const cognitive=await submitCognitive(running.parentPath,state.currentItem,running.cookie)
  expect(requireSuccess<any>(await request(running.parentPath,running.cookie)).status).toBe('COMPLETED')
  expect(await owner.cognitiveRawSubmission.count({where:{sessionId:cognitive.sessionId}})).toBe(1)
 },90_000)
 it('continues an unfinished frozen attempt after ordinary source retirement and intake close; current access deny blocks reads and FINAL',async()=>{
  const f=await teacherRuntimePgFixture(owner,'COGNITIVE'),running=await start(f)
  const state=requireSuccess<any>(await request(running.parentPath,running.cookie))
  const childPath=running.parentPath+'/items/'+state.currentItem.id+'/cognitive/'+state.currentItem.cognitiveSession.sessionId
  await owner.$executeRaw(Prisma.sql`UPDATE education_assessment_deliveries SET status='RETIRED',retired_by_user_id=${f.reviewer.id},retired_at=clock_timestamp() WHERE id=${f.resourceId}`)
  await closeTeacherRun({organizationId:f.organizationId,eventId:f.eventId,actorUserId:f.manager.id})
  await owner.user.update({where:{id:f.issuer.id},data:{isFrozen:true}})
  const restored=requireSuccess<any>(await request('/run-executions/'+f.executionId+'/start-assessment',running.cookie,'POST',{}))
  expect(restored).toMatchObject({runtimeBindingRef:running.parentId,replayed:true})
  expect(requireSuccess<any>(await request(running.parentPath,running.cookie)).status).toBe('IN_PROGRESS')
  const deny=await owner.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:f.respondent.id,
   permission:'RUN_START',reason:'Synthetic emergency stop in disposable database',deniedByUserId:f.manager.id}})
  expect((await request(running.parentPath,running.cookie)).status).toBe(404)
  expect((await request(childPath+'/submit',running.cookie,'POST',{})).status).toBe(404)
  expect(await owner.cognitiveRawSubmission.count({where:{sessionId:state.currentItem.cognitiveSession.sessionId}})).toBe(0)
  await owner.organizationAccessDeny.update({where:{id:deny.id},data:{liftedByUserId:f.manager.id,liftedAt:new Date()}})
  await submitCognitive(running.parentPath,state.currentItem,running.cookie)
  expect(requireSuccess<any>(await request(running.parentPath,running.cookie)).status).toBe('COMPLETED')
 },90_000)
 it('accepts an explicitly required SELF consent and blocks withdrawn unfinished work while preserving an accepted FINAL replay',async()=>{
  for(const revokeBeforeFinal of [true,false]){
   const f=await teacherRuntimePgFixture(owner,'COGNITIVE',true),cookie=teacherCookie(f.respondent)
   const consentPath='/run-executions/'+f.executionId+'/assessment-consent/accept'
   const pending=requireSuccess<any>(await request('/my-assessment-tasks',cookie)).list.find((row:any)=>row.executionId===f.executionId)
   expect(pending.consentRequired).toBe(true)
   const denied=await request('/run-executions/'+f.executionId+'/start-assessment',cookie,'POST',{})
   expect(denied.status).toBeGreaterThanOrEqual(400);expect(denied.status).toBeLessThan(500)
   expect(await owner.compositeAssessmentAttempt.count({where:{compositeAssessmentId:f.runtimeId}})).toBe(0)
   expect(requireSuccess<any>(await request(consentPath,cookie,'POST',{}))).toMatchObject({accepted:true,replayed:false})
   expect(requireSuccess<any>(await request(consentPath,cookie,'POST',{}))).toMatchObject({accepted:true,replayed:true})
   const running=await start(f),state=requireSuccess<any>(await request(running.parentPath,cookie))
   const accepted=await owner.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:running.parentId},select:{consentId:true}})
   expect(accepted.consentId).toBeTruthy()
   const cognitive=revokeBeforeFinal?null:await submitCognitive(running.parentPath,state.currentItem,cookie)
   // A child receipt is not the completed Composite. Use the same fresh parent
   // reconciliation as the participant host before claiming historical FINAL.
   if(!revokeBeforeFinal)expect(requireSuccess<any>(await request(running.parentPath,cookie)).status).toBe('COMPLETED')
   await owner.assessmentAttemptConsent.update({where:{id:accepted.consentId!},data:{revokedAt:new Date()}})
   if(revokeBeforeFinal){
    const childPath=running.parentPath+'/items/'+state.currentItem.id+'/cognitive/'+state.currentItem.cognitiveSession.sessionId
    for(const response of [await request(running.parentPath,cookie),await request(childPath+'/submit',cookie,'POST',{})]){
     expect(response.status).toBeGreaterThanOrEqual(400);expect(response.status).toBeLessThan(500)
    }
    expect(await owner.cognitiveRawSubmission.count({where:{sessionId:state.currentItem.cognitiveSession.sessionId}})).toBe(0)
   }else{
    expect(requireSuccess<any>(await request(running.parentPath,cookie)).status).toBe('COMPLETED')
    expect(requireSuccess<any>(await request(cognitive!.path+'/submit',cookie,'POST',cognitive!.payload)).replayed).toBe(true)
    expect(await owner.cognitiveRawSubmission.count({where:{sessionId:cognitive!.sessionId}})).toBe(1)
   }
  }
 },90_000)

 it('revokes the exact distribution grant to block new START while a frozen mixed Teacher attempt can finish',async()=>{
  const f=await teacherRuntimePgFixture(owner,'BUNDLE',false,true),running=await start(f)
  expect(f.otherExecutionId).toBeTruthy()
  await revokeAdminContentGrant(f.issuer.id,f.proof,f.distribution.grantId,{expectedVersion:1,reason:'Synthetic original distribution withdrawal'})
  const denied=await request('/run-executions/'+f.otherExecutionId+'/start-assessment',teacherCookie(f.other),'POST',{})
  expect(denied.status,JSON.stringify(denied.body)).toBe(403)
  expect(requireSuccess<any>(await request('/my-assessment-tasks',teacherCookie(f.other))).list).toEqual([])
  expect(await owner.compositeAssessmentAttempt.count({where:{compositeAssessmentId:f.runtimeId}})).toBe(1)
  expect(requireSuccess<any>(await request('/run-executions/'+f.executionId+'/start-assessment',running.cookie,'POST',{}))).toMatchObject({runtimeBindingRef:running.parentId,replayed:true})
  let state=requireSuccess<any>(await request(running.parentPath,running.cookie))
  await submitCognitive(running.parentPath,state.currentItem,running.cookie)
  state=requireSuccess<any>(await request(running.parentPath,running.cookie))
  await submitSjt(running.parentPath,state.currentItem,running.cookie)
  state=requireSuccess<any>(await request(running.parentPath,running.cookie))
  requireSuccess(await request(running.parentPath+'/form-sections/'+state.currentItem.formSectionId+'/submit',running.cookie,'POST',{
   submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:state.currentItem.definitionHash,contextSnapshotHash:state.contextSnapshotHash??null,
   answers:state.currentItem.answers.map((field:any)=>({formItemId:field.id,value:'synthetic after withdrawal'}))}))
  expect(requireSuccess<any>(await request(running.parentPath,running.cookie)).status).toBe('COMPLETED')
  expect(await owner.assessmentUnitSnapshot.count({where:{compositeAttemptId:running.parentId}})).toBe(3)
 },90_000)

})
