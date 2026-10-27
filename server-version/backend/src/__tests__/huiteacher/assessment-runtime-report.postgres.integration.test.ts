import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import type {AddressInfo} from 'node:net'
import {PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {runtimeDeliverySourceFixture,teacherRuntimePgFixture} from './assessment-runtime.postgres.fixture'
import {createTeacherAssessmentRuntimeRouter} from '../../modules/huiteacher/assessmentRuntime.routes'
import {teacherAssessmentRuntimeSource} from '../../modules/huiteacher/assessmentRuntime.source'
import {csrfProtection} from '../../middleware/csrf'
import {huiteacherOriginGuard} from '../../modules/huiteacher/originGuard'
import {generateToken} from '../../utils/jwt'
import {UserRole} from '../../types'
import {prisma} from '../../config/database'
import {createTrialEnvelope} from '../../modules/cognitive/v2/trial-envelope'
import {loadStoredCanonicalUnitResults} from '../../modules/assessment-runtime/compact-assessment-storage'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {verifyRuntimePrivileges} from '../../../scripts/runtime-role-contract.mjs'

import campusCompositeRouter from '../../modules/campus/composite.routes'
import {educationSchoolAssessmentReportRouter,educationTeacherAssessmentReportRouter} from '../../modules/reporting/education-assessment-report.routes'
import {setupEducationLibraryRuntimeFixture} from '../integration/educationLibraryRuntimeFixture'
import {addAssessmentRunTrackDraft} from '../../modules/assessment-run/repository'
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'

const url=integrationDatabaseUrl('TEACHER_RUNTIME_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
let owner:PrismaClient,server:Server,origin:string,entryBase='/api/huiteacher'
const teacherCookie=(actor:{id:string;username:string;role:string;accountDomain?:string},product:'HUITEACHER'|'SCHOOL'|'TRAINING'='HUITEACHER',copyIntoTeacherCookie=false)=>{
 const name=copyIntoTeacherCookie||product==='HUITEACHER'?'huiteacher_session':product==='SCHOOL'?'huischool_session':'ptool_session'
 return name+'='+generateToken({userId:actor.id,username:actor.username,role:actor.role as UserRole,tokenVersion:0,accountDomain:product==='TRAINING'?'TRAINING':'SCHOOL',
  ...(product==='HUITEACHER'?{sessionProduct:'HUITEACHER' as const,mfaVerifiedAt:Math.floor(Date.now()/1000)}:{})})+'; '+(product==='SCHOOL'?'huischool_csrf':'huiteacher_csrf')+'=pr363-csrf'
}
async function request(path:string,cookie:string,method='GET',body?:unknown,headers:Record<string,string>={}){
 const response=await fetch(origin+entryBase+path,{method,headers:{cookie,Origin:entryBase==='/api/campus'?'http://school.localhost':'http://teacher.localhost','Content-Type':'application/json','X-CSRF-Token':'pr363-csrf',...headers},
  ...(body===undefined?{}:{body:JSON.stringify(body)})})
 const text=await response.text(),data=response.headers.get('content-type')?.includes('application/json')?JSON.parse(text):{text}
 return {status:response.status,body:data}
}
function requireSuccess<T=any>(response:{status:number;body:any}):T{
 expect(response.status,JSON.stringify(response.body)).toBe(200)
 expect(response.body.code,JSON.stringify(response.body)).toBe(0)
 return response.body.data as T
}
async function submitCognitive(parentPath:string,item:any,cookie:string){
 const path=parentPath+'/items/'+item.id+'/cognitive/'+item.cognitiveSession.sessionId
 const child=requireSuccess<any>(await request(path,cookie))
 const trials=Array.from({length:child.config.totalTrials},(_,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*3000,
  endedAtPerfMs:trialIndex*3000+400,payload:{foreperiodMs:700+trialIndex*100,rtMs:400,prematureCount:0,interrupted:false,inputMode:'pointer'}}))
 const payload={submissionId:randomUUID(),attemptEpoch:child.attemptEpoch??1,definitionHash:child.definitionHash,contextSnapshotHash:child.contextSnapshotHash??null,trials}
 const result=requireSuccess<any>(await request(path+'/submit',cookie,'POST',payload))
 expect(result).toBeTruthy()
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


suite('Actual education producer to canonical FINAL to own frozen report',()=>{
 beforeAll(async()=>{
  process.env.CAMPUS_ELIGIBILITY_HMAC_KEY??='ef'.repeat(32)
  requireIsolatedReleaseDatabase(url!);if(new URL(url!).pathname!=='/pr363_runtime_test')throw new Error('Disposable PR363 database required')
  const fixtureUrl=new URL(process.env.TEACHER_RUNTIME_FIXTURE_OWNER_URL!),runtimeUrl=new URL(url!)
  if(fixtureUrl.host!==runtimeUrl.host||fixtureUrl.pathname!==runtimeUrl.pathname)throw new Error('Owner fixture URL must match exact isolated database')
  owner=new PrismaClient({datasources:{db:{url:fixtureUrl.href}}})
  expect(await verifyRuntimePrivileges(prisma)).toMatchObject({restrictedRuntimeRole:true})
  const app=express();app.use(express.json({limit:'2mb'}));app.use('/api',csrfProtection)
  app.use('/api/huiteacher',huiteacherOriginGuard,createTeacherAssessmentRuntimeRouter(teacherAssessmentRuntimeSource),educationTeacherAssessmentReportRouter)
  app.use('/api/campus',campusCompositeRouter,educationSchoolAssessmentReportRouter)
  app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(error.statusCode??500).json({code:error.code??'UNEXPECTED',message:error.message}))
  server=await new Promise<Server>(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance))});origin='http://127.0.0.1:'+(server.address() as AddressInfo).port
 },60_000)
 afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await owner?.$disconnect();await prisma.$disconnect()})
 it.each([{product:'TEACHER',timing:'IMMEDIATE',formOnly:false,completionOnly:false},{product:'SCHOOL',timing:'IMMEDIATE',formOnly:false,completionOnly:false},{product:'TEACHER',timing:'FUTURE',formOnly:false,completionOnly:false},{product:'TEACHER',timing:'DUE',formOnly:false,completionOnly:false},{product:'TEACHER',timing:'FUTURE',formOnly:true,completionOnly:false},{product:'TEACHER',timing:'FUTURE',formOnly:true,completionOnly:true},{product:'TEACHER',timing:'DUE',formOnly:true,completionOnly:true},{product:'TEACHER',timing:'ADMIN_IMMEDIATE',formOnly:false,completionOnly:false},{product:'SCHOOL',timing:'FUTURE',formOnly:false,completionOnly:false},{product:'SCHOOL',timing:'DUE',formOnly:false,completionOnly:false}] as const)('$product $timing Form=$formOnly completionOnly=$completionOnly actual producer FINAL report opening',async({product,timing,formOnly,completionOnly})=>{
  const feedbackPolicy=(timing==='IMMEDIATE'||timing==='ADMIN_IMMEDIATE')?{schemaVersion:1 as const,mode:'IMMEDIATE' as const}:{schemaVersion:1 as const,mode:'SCHEDULED' as const,releaseAt:new Date(Date.now()+(timing==='FUTURE'?86400000:-86400000)).toISOString()}
  if(product==='SCHOOL'&&feedbackPolicy.mode==='SCHEDULED')feedbackPolicy.releaseAt=new Date(Date.parse(feedbackPolicy.releaseAt)+8*3600000).toISOString().replace('Z','+08:00')
  const frozenPolicy=feedbackPolicy.mode==='SCHEDULED'?{...feedbackPolicy,releaseAt:new Date(feedbackPolicy.releaseAt).toISOString()}:feedbackPolicy
  entryBase=product==='TEACHER'?'/api/huiteacher':'/api/campus'
  let f:any
  if(product==='TEACHER')f=await teacherRuntimePgFixture(owner,'BUNDLE',false,false,!formOnly,feedbackPolicy,formOnly,completionOnly)
  else{
   const school=await setupEducationLibraryRuntimeFixture({db:owner,product:'SCHOOL',publish:false,trackCount:0})
   const issuer=await owner.user.findUniqueOrThrow({where:{id:school.libraryAdminUserId}})
   const reviewer=await owner.user.create({data:{username:'pr363-report-review-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',role:'ADMIN',platformRole:'SYSTEM_ADMIN'}})
   const delivery=await runtimeDeliverySourceFixture(owner,'SCHOOL',{id:school.organizationId},issuer,reviewer,'BUNDLE',false,true,feedbackPolicy)
   const a=delivery.entry.applicability
   await addAssessmentRunTrackDraft({organizationId:school.organizationId,runId:school.runId,actorUserId:school.managerUserId,expectedVersion:school.expectedVersion,expectedRunId:school.runId,educationWorkflow:{product:'SCHOOL',id:school.workflow.id},
    resource:{family:'BUNDLE',key:delivery.resourceKey,version:'1.0.0'},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[school.participantMembershipId!]},
    respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[school.participantMembershipId!]},requestedPolicy:{subjectRoles:a.subjectRoles,respondentRoles:a.respondentRoles,
     relationshipKinds:a.relationshipKinds,perspectives:a.perspectives,analysisMode:a.analysisMode,visibilityPolicyKey:a.visibilityPolicyKey,minimumRespondents:a.minimumRespondents}})
   await school.open();await school.publish()
   const executions=await school.executions()
   f={...delivery,organizationId:school.organizationId,executionId:executions[0].id,respondent:await owner.user.findUniqueOrThrow({where:{id:school.participantUserId}}),issuer}
  }
  if(timing==='ADMIN_IMMEDIATE')f.respondent=await owner.user.update({where:{id:f.respondent.id},data:{role:'ADMIN'}})
  expect(f.origin.feedbackPolicy).toEqual(frozenPolicy)
  const cookie=teacherCookie(f.respondent,product==='TEACHER'?'HUITEACHER':'SCHOOL')
  const started=await startAssessmentRunExecution({executionId:f.executionId,actorUserId:f.respondent.id})
  expect(started.state).toBe('STARTED');if(started.state!=='STARTED')throw new Error('Actual durable START required')
  const parentPath=(product==='TEACHER'?'/assessment-composite-attempts/':'/composite-attempts/')+started.runtimeBindingRef
  let state=requireSuccess<any>(await request(parentPath,cookie))
  let cg:{sessionId:string}|null=null
  if(!formOnly){
   cg=await submitCognitive(parentPath,state.currentItem,cookie)
   state=requireSuccess<any>(await request(parentPath,cookie));await submitSjt(parentPath,state.currentItem,cookie)
   state=requireSuccess<any>(await request(parentPath,cookie))
  }
  requireSuccess(await request(parentPath+'/form-sections/'+state.currentItem.formSectionId+'/submit',cookie,'POST',{
   submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:state.currentItem.definitionHash,contextSnapshotHash:state.contextSnapshotHash??null,
   answers:state.currentItem.answers.map((field:any)=>({formItemId:field.id,value:'synthetic frozen report journey'}))}))
  expect(requireSuccess<any>(await request(parentPath,cookie)).status).toBe('COMPLETED')
  const before=await owner.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:started.runtimeBindingRef},orderBy:{slotKey:'asc'}})
  const fingerprint=canonicalHash(before.map(row=>({...row,completedAt:row.completedAt?.toISOString(),createdAt:row.createdAt.toISOString()})))
  const endpoint='/assessment-reports/executions/'+f.executionId
  const report=requireSuccess<any>(await request(endpoint,cookie))
  if(timing==='FUTURE'){
   expect(report,JSON.stringify(report)).toMatchObject({state:'WITHHELD',mode:'NONE',...(!formOnly||completionOnly?{releaseAt:frozenPolicy.mode==='SCHEDULED'?frozenPolicy.releaseAt:null}:{})})
   expect(report).not.toHaveProperty('reports')
  }else if(formOnly){
   expect(report,JSON.stringify(report)).toMatchObject({state:'COMPLETED',mode:'COMPLETION_ONLY'});expect(report).not.toHaveProperty('reports')
  }else{
   expect(report,JSON.stringify(report)).toMatchObject({state:'READY',mode:'INDIVIDUAL_SUMMARY'})
   expect(report.reports).toHaveLength(2)
   for(const unit of report.reports){
    expect(unit.status,JSON.stringify(unit)).toBe('READY')
    const stored=before.find(row=>row.slotKey.endsWith(unit.itemId))!
    const [fact]=await loadStoredCanonicalUnitResults([stored.canonicalResultEncrypted!])
    const metrics=unit.rendered.blocks.filter((block:any)=>block.type==='METRIC')
    expect(metrics.length).toBeGreaterThan(0)
    for(const metric of metrics)expect(fact.core.metrics.some(value=>value.value===metric.value&&typeof metric.value==='number')).toBe(true)
   }
  }
  expect((await request(endpoint,teacherCookie(f.issuer,'TRAINING'))).status).toBe(401)
  const repeated=requireSuccess<any>(await request(endpoint,cookie));expect(repeated).toEqual(report)
  if(cg)expect(await owner.cognitiveRawSubmission.count({where:{sessionId:cg.sessionId}})).toBe(1)
  const after=await owner.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:started.runtimeBindingRef},orderBy:{slotKey:'asc'}})
  expect(canonicalHash(after.map(row=>({...row,completedAt:row.completedAt?.toISOString(),createdAt:row.createdAt.toISOString()})))).toBe(fingerprint)
 },120_000)
})
