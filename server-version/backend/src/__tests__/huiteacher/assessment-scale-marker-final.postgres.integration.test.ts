import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import type {AddressInfo} from 'node:net'
import {PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {standardMarkerSource,privateMarkerSource} from './assessment-scale-marker.postgres.fixture'
import * as producer from '../../modules/education-tools/assessment-resource.service'
import {issueAdminContentRoot,revokeAdminContentGrant} from '../../modules/measurement-content/admin-authority.service'
import {testDisclosure} from '../assessment-policy/result-disclosure.fixture'
import {createTeacherAssessmentRuntimeRouter} from '../../modules/huiteacher/assessmentRuntime.routes'
import {teacherAssessmentRuntimeSource} from '../../modules/huiteacher/assessmentRuntime.source'
import {csrfProtection} from '../../middleware/csrf'
import {huiteacherOriginGuard} from '../../modules/huiteacher/originGuard'
import {generateToken} from '../../utils/jwt'
import {UserRole} from '../../types'
import {prisma} from '../../config/database'
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
suite('Actual education Scale marker START and FINAL',()=>{
 beforeAll(async()=>{
  process.env.CAMPUS_ELIGIBILITY_HMAC_KEY??='ef'.repeat(32)
  requireIsolatedReleaseDatabase(url!);if(new URL(url!).pathname!=='/pr363_runtime_test')throw new Error('Disposable PR363 database required')
  const ownerUrl=new URL(process.env.TEACHER_RUNTIME_FIXTURE_OWNER_URL!);if(ownerUrl.host!==new URL(url!).host||ownerUrl.pathname!==new URL(url!).pathname)throw new Error('Matching fixture owner required')
  owner=new PrismaClient({datasources:{db:{url:ownerUrl.href}}})
  expect(await verifyRuntimePrivileges(prisma)).toMatchObject({restrictedRuntimeRole:true})
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/huiteacher',huiteacherOriginGuard,createTeacherAssessmentRuntimeRouter(teacherAssessmentRuntimeSource),educationTeacherAssessmentReportRouter)
  app.use('/api/campus',campusCompositeRouter,educationSchoolAssessmentReportRouter)
  app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(error.statusCode??500).json({code:error.code??'UNEXPECTED',message:error.message}))
  server=await new Promise<Server>(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance))});origin='http://127.0.0.1:'+(server.address() as AddressInfo).port
 },60_000)
 afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await owner?.$disconnect();await prisma.$disconnect()})
 it.each(['SCHOOL','TEACHER'] as const)('%s exact Scale marker completes real FINAL after ordinary target distribution withdrawal',async product=>{
  entryBase=product==='TEACHER'?'/api/huiteacher':'/api/campus'
  const f=await setupEducationLibraryRuntimeFixture({db:owner,product,publish:false,trackCount:0})
  if(product==='SCHOOL')await owner.$executeRaw`UPDATE organization_units SET name='七年级（合成）' WHERE organization_id=${f.organizationId} AND id=(SELECT parent_unit_id FROM organization_units WHERE id=${f.classUnitId!})`
  const author=await owner.user.findUniqueOrThrow({where:{id:f.managerUserId}})
  const system=await owner.user.findUniqueOrThrow({where:{id:f.libraryAdminUserId}})
  const principal=(user:typeof author)=>({userId:user.id,username:user.username,role:user.role,accountDomain:user.accountDomain,platformRole:user.platformRole,tokenVersion:user.tokenVersion,mustChangePassword:user.mustChangePassword})
  const context={product,organizationId:f.organizationId,principal:principal(author)}
  const reviewer=await owner.user.create({data:{username:'pr363-scale-review-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
  const membership=await owner.organizationMembership.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:reviewer.id}})
  await owner.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:membership.id,product:product==='SCHOOL'?'HUISCHOOL':'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:system.id}})
  const reviewerContext={...context,principal:principal(reviewer)}
  if(product==='TEACHER'){
   const m=await owner.organizationMembership.findFirstOrThrow({where:{organizationId:f.organizationId,userId:author.id}})
   await owner.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:m.id,persona:'COUNSELOR',grantedByUserId:system.id}})
   await owner.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:m.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:system.id}})
  }
  const source=product==='SCHOOL'?await standardMarkerSource(owner):await privateMarkerSource(owner,{entry:'TEACHER',organizationId:f.organizationId,principal:context.principal})
  const proof={tokenVersion:0,adminSessionId:'synthetic-scale-proof',adminVerifiedAt:Date.now()/1000}
  const granted=await issueAdminContentRoot(system.id,proof,{requestId:randomUUID(),expectedVersion:0,reason:'Exact synthetic target Scale marker runtime',grant:{subjectId:author.id,
   scope:{product,scopeKind:'ORGANIZATION',scopeId:f.organizationId,resourceKind:'material',resourceKeys:source.resourceIds},capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60_000).toISOString(),expiresAt:new Date(Date.now()+3600_000).toISOString()}})
  const licenses=source.resourceIds.map(resourceId=>({resourceId,grantId:granted.grantId}))
  const prepared=await producer.prepareEducationAssessment(context,{resourceId:randomUUID(),sourceCompositeId:source.original.id,title:'Synthetic exact '+product+' Scale marker',family:'BUNDLE',licenses})
  const registered=await producer.registerEducationAssessment(context,prepared.resourceId,{expectedPreparationHash:prepared.preparationHash,disclosure:testDisclosure(),feedbackPolicy:{schemaVersion:1,mode:'IMMEDIATE'},references:{schemaVersion:1,units:[]},reports:[],licenses})
  const reviewed=await producer.transitionEducationAssessment(reviewerContext,prepared.resourceId,'REVIEW',{expectedEntryHash:registered.entryHash,reason:'Independent exact Scale fixture review'})
  const published=await producer.transitionEducationAssessment(reviewerContext,prepared.resourceId,'PUBLISH',{expectedEntryHash:reviewed.entryHash,reason:'Isolated Scale runtime fixture only'})
  const a=registered.entry.applicability
  await addAssessmentRunTrackDraft({organizationId:f.organizationId,runId:f.runId,actorUserId:f.managerUserId,expectedVersion:f.expectedVersion,expectedRunId:f.runId,educationWorkflow:{product,id:f.workflow.id},
   resource:{family:'BUNDLE',key:published.resourceKey,version:'1.0.0'},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.participantMembershipId!]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.participantMembershipId!]},
   requestedPolicy:{subjectRoles:a.subjectRoles,respondentRoles:a.respondentRoles,relationshipKinds:a.relationshipKinds,perspectives:a.perspectives,analysisMode:a.analysisMode,visibilityPolicyKey:a.visibilityPolicyKey,minimumRespondents:a.minimumRespondents}})
  await f.open();await f.publish();const executions=await f.executions(),executionId=executions[0].id
  const participant=await owner.user.findUniqueOrThrow({where:{id:f.participantUserId}}),cookie=teacherCookie(participant,product==='SCHOOL'?'SCHOOL':'HUITEACHER')
  const started=await startAssessmentRunExecution({executionId,actorUserId:participant.id});expect(started.state).toBe('STARTED');if(started.state!=='STARTED')throw new Error('Actual START required')
  const parentPath=(product==='SCHOOL'?'/composite-attempts/':'/assessment-composite-attempts/')+started.runtimeBindingRef
  let state=requireSuccess<any>(await request(parentPath,cookie))
  if(product==='SCHOOL'){
   expect(state.currentItem.type).toBe('FORM_SECTION')
   requireSuccess(await request(parentPath+'/form-sections/'+state.currentItem.formSectionId+'/submit',cookie,'POST',{submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:state.currentItem.definitionHash,contextSnapshotHash:state.contextSnapshotHash??null,answers:state.currentItem.answers.map((field:any)=>({formItemId:field.id,value:'7'}))}))
   state=requireSuccess<any>(await request(parentPath,cookie))
  }
  expect(state.currentItem.type).toBe('SCALE')
  const item=state.currentItem
  const payload={submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:state.contextSnapshotHash??null,
   answers:item.scale.definition.items.map((question:any)=>({itemCode:question.itemCode,responseValue:question.options[0].value,responseTimeMs:1000}))}
  await revokeAdminContentGrant(system.id,proof,granted.grantId,{expectedVersion:1,reason:'Ordinary new target distribution withdrawn after accepted binding'})
  const result=await request(parentPath+'/items/'+item.id+'/scale/submit',cookie,'POST',payload)
  requireSuccess(result)
  expect(requireSuccess<any>(await request(parentPath,cookie)).status).toBe('COMPLETED')
  const report=requireSuccess<any>(await request('/assessment-reports/executions/'+executionId,cookie));expect(report.state).toBe('WITHHELD');expect(report).not.toHaveProperty('reports')
  expect(await owner.assessmentUnitSnapshot.count({where:{compositeAttemptId:started.runtimeBindingRef,unitType:'SCALE',terminalState:'COMPLETED'}})).toBe(1)
 },120_000)
})
