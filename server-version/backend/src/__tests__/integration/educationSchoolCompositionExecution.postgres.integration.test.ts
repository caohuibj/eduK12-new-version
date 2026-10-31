import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupSchoolCompositionExecution,setupSchoolCompositionDraft} from './educationPrivateCompositionExecutionFixture'
import activityRunRouter from '../../modules/campus/activity.run.routes'
import compositeRouter from '../../modules/campus/composite.routes'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
import {SCHOOL_AUTH_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'
import {listCampusStudentTasks} from '../../modules/campus/activity.tasks'
import {resolveEducationToolAuthoringContext} from '../../modules/education-tools/access'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,server:Server,base:string
async function request(path:string,userId:string,body?:unknown,teacherCredential=false){
 const user=await db.user.findUniqueOrThrow({where:{id:userId}}),csrf='synthetic-school-composition-csrf'
 const token=generateToken({userId,username:user.username,role:user.role,tokenVersion:user.tokenVersion,accountDomain:'SCHOOL',
  mfaVerifiedAt:Math.floor(Date.now()/1000),...(teacherCredential?{sessionProduct:'HUITEACHER' as const}:{})})
 const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{cookie:`${SCHOOL_AUTH_COOKIE_NAME}=${token}; ${SCHOOL_CSRF_COOKIE_NAME}=${csrf}`,
  [CSRF_HEADER_NAME]:csrf,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
 const text=await response.text(),value=response.headers.get('content-type')?.includes('application/json')?JSON.parse(text):{text}
 return {status:response.status,headers:response.headers,value,data:value.data}
}
suite('School psychological author / ordinary questionnaire real HTTP execution',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='56'.repeat(32);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='57'.repeat(32)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  const app=express();app.use(express.json());app.use('/api',csrfProtection);app.use('/api/campus',activityRunRouter,compositeRouter)
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve))
  base='http://127.0.0.1:'+(server.address() as {port:number}).port+'/api/campus'
 })
 afterAll(async()=>{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}await db?.$disconnect()})
 it('runs one student Scale/Form questionnaire after author withdrawal and projects only the own allowed block',async()=>{
  const f=await setupSchoolCompositionExecution(db,{instructions:['School Scale transition','School Form transition','']})
  const actor=await db.user.findUniqueOrThrow({where:{id:f.participantUserId}})
  expect(await resolveEducationToolAuthoringContext({entry:'SCHOOL',organizationId:f.organizationId,principal:{userId:actor.id,accountDomain:'SCHOOL'}})).toBeNull()
  const page=await listCampusStudentTasks({userId:actor.id,username:actor.username,role:actor.role,accountDomain:'SCHOOL',tokenVersion:actor.tokenVersion},
   {page:1,pageSize:20,activityId:f.workflow.id})
  const task=page.list.find(row=>row.id===f.executionId)
  expect(task).toMatchObject({resourceFamily:'BUNDLE',feedbackNamespace:'EDUCATION_ASSESSMENT',feedbackMode:'COMPOSITION',status:'PENDING'})
  const execution=`/organizations/${f.organizationId}/activities/${f.workflow.id}/runs/${f.runId}/executions/${f.executionId}`
  if(task!.consentRequired)expect((await request(execution+'/consent/accept',actor.id,{})).status).toBe(200)
  const started=await request(execution+'/start',actor.id,{})
  expect(started.status,JSON.stringify(started.value)).toBe(200);expect(started.data).toMatchObject({state:'STARTED',runtimeBindingKind:'COMPOSITE'})
  const attempt=started.data.runtimeBindingRef,path='/composite-attempts/'+attempt+'?view=current-unit'
  const member=await db.organizationMembership.findFirstOrThrow({where:{organizationId:f.organizationId,userId:f.managerUserId,validUntil:null}})
  await db.organizationCapabilityGrant.updateMany({where:{membershipId:member.id,capability:'PSYCHOLOGY_STAFF',revokedAt:null},data:{revokedAt:new Date()}})
  expect((await request(execution+'/start',actor.id,{})).data).toMatchObject({runtimeBindingRef:attempt,replayed:true})
  for(let index=0;index<3;index++){
   const state=await request(path,actor.id),item=state.data.currentItem
   expect(state.status,JSON.stringify(state.value)).toBe(200);expect(state.data.totalItems).toBe(3)
   expect(item.type).toBe(['SCALE','FORM_SECTION','SCALE'][index])
   if(index<2)expect(item.questionnaireInstruction).toBe(['School Scale transition','School Form transition'][index])
   const common={submissionId:randomUUID(),attemptEpoch:state.data.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:state.data.contextSnapshotHash}
   const endpoint='/composite-attempts/'+attempt+(item.type==='SCALE'?`/items/${item.id}/scale/submit`:`/form-sections/${item.formSectionId}/submit`)
   const answers=item.type==='SCALE'?item.scale.definition.items.map((q:any)=>({itemCode:q.itemCode,responseValue:'a'})):
    item.answers.map((q:any)=>({formItemId:q.formItemId,value:'School fixed Form response'}))
   const final=await request(endpoint,actor.id,{...common,answers});expect(final.status,JSON.stringify(final.value)).toBe(200)
   expect((await request(endpoint,actor.id,{...common,answers})).status).toBe(200)
  }
  expect((await request(path,actor.id)).data.status).toBe('COMPLETED')
  expect(await db.compositeAssessmentAttempt.count({where:{assignmentRef:(await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attempt}})).assignmentRef}})).toBe(1)
  const feedbackPath='/run-executions/'+f.executionId+'/feedback',feedback=await request(feedbackPath,actor.id)
  expect(feedback.status,JSON.stringify(feedback.value)).toBe(200)
  expect(feedback.data).toMatchObject({kind:'EDUCATION_FEEDBACK',mode:'COMPOSITION',state:'READY'})
  expect(feedback.data.units.map((unit:any)=>unit.state)).toEqual(['READY','COMPLETION_ONLY','WITHHELD'])
  expect(JSON.stringify(feedback.data)).toContain('Visible fixed reflection')
  expect(JSON.stringify(feedback.data)).not.toMatch(/PRIVATE NONE BLOCK FEEDBACK|School fixed Form response|educationComposition|manifestHash|canonicalResult/)
  expect((await request(feedbackPath,f.managerUserId)).status).toBe(404)
  const outsideImage=await request(feedbackPath+'/images/synthetic-outside-projection',actor.id)
  expect(outsideImage.status).toBe(404);expect(outsideImage.headers.get('cache-control')).toBe('private, no-store, max-age=0')
  expect((await request(feedbackPath,actor.id,undefined,true)).status).toBe(401)
  await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:actor.id,permission:'REPORT_READ',reason:'Synthetic report deny',deniedByUserId:f.managerUserId}})
  expect((await request(feedbackPath,actor.id)).status).toBe(404)
 })
 it('enforces the real School author/own workflow/CAS before HTTP attachment, and rejects a new start after author withdrawal',async()=>{
  const f=await setupSchoolCompositionDraft(db),path=`/organizations/${f.organizationId}/activities/${f.workflow.id}/runs/${f.runId}`
  if(!f.schoolAdmin)throw new Error('Missing real School administrator')
  const before=await db.compositeAssessment.count({where:{createdBy:f.managerUserId}})
  expect((await request(path+'/tracks',f.schoolAdmin.userId,f.body)).status).toBe(403)
  expect((await request(path+'/tracks',f.participantUserId,f.body)).status).toBe(403)
  const other=await db.user.create({data:{username:'schpsych'+randomUUID().replaceAll('-','').slice(0,22),passwordHash:'synthetic-only',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
  const member=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:other.id}})
  await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:member.id,persona:'COUNSELOR',grantedByUserId:f.managerUserId}})
  await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:member.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:f.managerUserId}})
  expect(await resolveEducationToolAuthoringContext({entry:'SCHOOL',organizationId:f.organizationId,principal:{userId:other.id,accountDomain:'SCHOOL'}})).not.toBeNull()
  expect((await request(path+'/tracks',other.id,f.body)).status).toBe(403)
  const foreign=await setupSchoolCompositionDraft(db)
  const crossSchool=await request(path+'/tracks',f.managerUserId,{...f.body,privateComposition:{versionId:foreign.fixed.id,contentHash:foreign.fixed.contentHash}})
  expect(crossSchool.status,JSON.stringify(crossSchool.value)).toBe(404)
  expect(await db.$queryRaw`SELECT id FROM assessment_run_tracks WHERE run_id=${f.runId}`).toHaveLength(0)
  expect(await db.compositeAssessment.count({where:{createdBy:f.managerUserId}})).toBe(before)
  const added=await request(path+'/tracks',f.managerUserId,f.body)
  expect(added.status,JSON.stringify(added.value)).toBe(200)
  const detail=await request(path,f.managerUserId)
  expect(detail.status,JSON.stringify(detail.value)).toBe(200)
  expect(detail.data.tracks[0]).toMatchObject({title:f.fixed.title,sourceRevision:f.fixed.sourceRevision})
  expect(detail.data.tracks[0]).not.toHaveProperty('definition')
  expect((await request(path+'/tracks',f.managerUserId,f.body)).status).toBe(409)
  const version=f.expectedVersion+1
  const preview=await request(path+'/preview',f.managerUserId,{expectedVersion:version})
  expect(preview.status,JSON.stringify(preview.value)).toBe(200)
  expect(preview.data.tracks).toHaveLength(1);expect(preview.data.tracks[0].resourcePolicy).not.toHaveProperty('educationComposition')
  await f.open()
  const published=await request(path+'/publish',f.managerUserId,{expectedVersion:version})
  expect(published.status,JSON.stringify(published.value)).toBe(200)
  const [execution]=await f.executions(),author=await db.organizationMembership.findFirstOrThrow({where:{organizationId:f.organizationId,userId:f.managerUserId,validUntil:null}})
  await db.organizationCapabilityGrant.updateMany({where:{membershipId:author.id,capability:'PSYCHOLOGY_STAFF',revokedAt:null},data:{revokedAt:new Date()}})
  const result=await request(path+'/executions/'+execution.id+'/start',f.participantUserId,{})
  expect(result.status).toBe(403)
  expect(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:f.runtime.compositeId}})).toBe(0)
 })
})
