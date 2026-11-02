import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationLibraryRuntimeFixture} from './educationLibraryRuntimeFixture'
import {createU4Candidate} from '../../modules/education-tools/u4-candidates.service'
import {createPrivateTool,freezePrivateTool} from '../../modules/education-tools/private-tool.service'
import {addTeacherPrivateCompositionRunTrack,publishTeacherRun} from '../../modules/huiteacher/run.service'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
import {createTeacherAssessmentRuntimeRouter} from '../../modules/huiteacher/assessmentRuntime.routes'
import {teacherAssessmentRuntimeSource} from '../../modules/huiteacher/assessmentRuntime.source'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
import {HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'
import {readTeacherOrdinaryFeedback} from '../../modules/reporting/education-ordinary-feedback.service'
import {updatePrivateTool} from '../../modules/education-tools/private-tool.service'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,server:Server,base:string
async function headers(userId:string){
 const user=await db.user.findUniqueOrThrow({where:{id:userId}}),csrf='synthetic-ordinary-csrf'
 const token=generateToken({userId,username:user.username,role:user.role,tokenVersion:user.tokenVersion,accountDomain:'SCHOOL',
  sessionProduct:'HUITEACHER',mfaVerifiedAt:Math.floor(Date.now()/1000)})
 return {cookie:`${HUITEACHER_AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; ${HUITEACHER_CSRF_COOKIE_NAME}=${csrf}`,
  [CSRF_HEADER_NAME]:csrf,'content-type':'application/json'}
}
async function request(path:string,auth:Record<string,string>,body?:unknown){
 const response=await fetch(base+path,{headers:auth,...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})})
 const value=await response.json()
 return {status:response.status,value,data:value.data}
}
suite('U4 candidate to frozen Teacher SELF Form FINAL and authorized description',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='56'.repeat(32);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='57'.repeat(32)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/huiteacher',createTeacherAssessmentRuntimeRouter(teacherAssessmentRuntimeSource))
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve))
  base='http://127.0.0.1:'+(server.address() as {port:number}).port+'/api/huiteacher'
 })
 afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await db?.$disconnect()})
 it('runs a single selected topic independently, preserves frozen report config and current authority',async()=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product:'TEACHER',trackCount:0,publish:false})
  const context:PrivateToolContext={entry:'TEACHER',organizationId:f.organizationId,principal:{userId:f.managerUserId,accountDomain:'SCHOOL'}}
  const candidate=await createU4Candidate(context,{key:'u4-tr36--tr-t01'})
  const definition=structuredClone(candidate.definition) as any
  definition.descriptive.exploratoryMeans=true
  const saved=await updatePrivateTool(context,candidate.id,{expectedRevision:candidate.revision,title:candidate.title,definition})
  const fixed=await freezePrivateTool(context,candidate.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
  const draft=await createPrivateTool(context,{kind:'COMPOSITION',title:'U4 independently selected teacher topic'})
  const composition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'SELF'},instruction:'本次只使用一个专题',
   blocks:[{blockId:randomUUID(),instruction:'',source:{provider:'PRIVATE_VERSION',kind:'FORM',versionId:fixed.id,contentHash:fixed.contentHash}}]}
  const updated=await updatePrivateTool(context,draft.id,{expectedRevision:draft.revision,title:draft.title,definition:composition})
  const bundle=await freezePrivateTool(context,draft.id,{expectedRevision:updated.revision,expectedContentHash:updated.contentHash})
  const teacher={organizationId:f.organizationId,eventId:f.workflow.id,actorUserId:f.managerUserId}
  await addTeacherPrivateCompositionRunTrack(teacher,{expectedVersion:f.expectedVersion,privateComposition:{versionId:bundle.id,contentHash:bundle.contentHash},
   subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]}})
  await f.open();await publishTeacherRun({...teacher,expectedVersion:f.expectedVersion+1})
  const [execution]=await f.executions(),auth=await headers(f.participantUserId)
  const tasks=await request('/my-assessment-tasks',auth),task=tasks.data.list.find((row:any)=>row.executionId===execution.id)
  if(task.consentRequired)expect((await request(`/run-executions/${execution.id}/assessment-consent/accept`,auth,{})).status).toBe(200)
  const start=await request(`/run-executions/${execution.id}/start-assessment`,auth,{})
  expect(start.status,JSON.stringify(start.value)).toBe(200)
  const id=start.data.runtimeBindingRef,path=`/assessment-composite-attempts/${id}`,state=await request(path,auth),current=state.data.currentItem
  expect(state.data.totalItems).toBe(1);expect(current.type).toBe('FORM_SECTION')
  // Only the mutable author draft changes. The active run and report keep their frozen rules.
  definition.descriptive.exploratoryMeans=false
  await updatePrivateTool(context,candidate.id,{expectedRevision:saved.revision,title:candidate.title,definition})
  const final=await request(path+`/form-sections/${current.formSectionId}/submit`,auth,{submissionId:randomUUID(),attemptEpoch:state.data.attemptEpoch,
   definitionHash:current.definitionHash,contextSnapshotHash:state.data.contextSnapshotHash,
   answers:current.answers.map((item:any,i:number)=>({formItemId:item.formItemId,value:['f0','f2','na'][i]}))})
  expect(final.status,JSON.stringify(final.value)).toBe(200)
  expect((await request(path,auth)).data.status).toBe('COMPLETED')
  const feedback=await request(`/run-executions/${execution.id}/feedback`,auth)
  expect(feedback.status,JSON.stringify(feedback.value)).toBe(200)
  expect(feedback.data.units).toHaveLength(1)
  expect(feedback.data.units[0]).toMatchObject({kind:'FORM',state:'READY',formDescription:{version:'ordinal-description-v1',
   items:[{code:0,state:'VALID'},{code:2,state:'VALID'},{code:null,state:'NONRESPONSE_OPTION'}],exploratoryMeans:[{value:null,completeItems:2,expectedItems:3}]}})
  expect(JSON.stringify(feedback.value)).not.toMatch(/canonicalResultEncrypted|collectionFactsEncrypted|manifestHash/)
  await expect(readTeacherOrdinaryFeedback({executionId:execution.id,actorUserId:f.managerUserId})).rejects.toMatchObject({statusCode:404})
  await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:f.participantUserId,permission:'REPORT_READ',reason:'Synthetic withdrawal',deniedByUserId:f.managerUserId}})
  expect((await request(`/run-executions/${execution.id}/feedback`,auth)).status).toBe(404)
 },120_000)
})
