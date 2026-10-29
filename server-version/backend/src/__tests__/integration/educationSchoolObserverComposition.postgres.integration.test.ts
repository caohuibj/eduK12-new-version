import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationLibraryRuntimeFixture} from './educationLibraryRuntimeFixture'
import {educationPrivateToolRouter} from '../../modules/education-tools/private-tool.routes'
import {authenticateSchool} from '../../middleware/auth'
import activityRouter from '../../modules/campus/activity.run.routes'
import compositeRouter from '../../modules/campus/composite.routes'
import {listCampusParentRunTasks} from '../../modules/campus/activity.tasks'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
import {SCHOOL_AUTH_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'
import * as sourceBodies from '../../modules/education-tools/library-source.scale'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
suite('School ordinary observer questionnaire: exact subject, relationship and consent',()=>{
 let server:Server,base:string
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/campus/organizations/:organizationId/private-tools',authenticateSchool,educationPrivateToolRouter('SCHOOL'))
  app.use('/api/campus',activityRouter,compositeRouter)
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port+'/api/campus'
 })
 afterAll(async()=>{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}vi.restoreAllMocks();await db.$disconnect()})
 async function request(userId:string,path:string,body?:unknown,method?:string){
  const user=await db.user.findUniqueOrThrow({where:{id:userId}}),csrf='synthetic-observer-composition-csrf'
  const token=generateToken({userId,username:user.username,role:user.role,tokenVersion:user.tokenVersion,accountDomain:'SCHOOL',mfaVerifiedAt:Math.floor(Date.now()/1000)})
  const response=await fetch(base+path,{method:method??(body===undefined?'GET':'POST'),headers:{'content-type':'application/json',
   cookie:`${SCHOOL_AUTH_COOKIE_NAME}=${token}; ${SCHOOL_CSRF_COOKIE_NAME}=${csrf}`,[CSRF_HEADER_NAME]:csrf},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value:any=await response.json();return {status:response.status,value,data:value.data}
 }
 async function prepare(mode:'PARENT_REPORT'|'TEACHER_REPORT'){
  const f=await setupEducationLibraryRuntimeFixture({db,product:'SCHOOL',responseMode:mode,publisher:'PSYCHOLOGY',trackCount:0,publish:false})
  const tools=`/organizations/${f.organizationId}/private-tools`,author=f.managerUserId
  const fixed=async(kind:'FORM'|'COMPOSITION',definition:unknown)=>{
   const created=await request(author,tools,{kind,title:'Synthetic observer '+kind});expect(created.status,JSON.stringify(created.value)).toBe(200)
   const saved=await request(author,tools+'/'+created.data.id,{expectedRevision:1,title:created.data.title,definition},'PUT');expect(saved.status,JSON.stringify(saved.value)).toBe(200)
   const input={expectedRevision:saved.data.revision,expectedContentHash:saved.data.contentHash}
   const version=await request(author,tools+'/'+created.data.id+'/freeze',input);expect(version.status,JSON.stringify(version.value)).toBe(200)
   return {version:version.data,input,path:tools+'/'+created.data.id}
  }
  const [entry]=await db.$queryRaw<Array<{hash:string}>>`SELECT s.snapshot_hash AS hash FROM scale_library_entries e JOIN scale_library_submissions s ON s.id=e.submission_id WHERE e.id=${f.entryId}`
  const form=await fixed('FORM',{schemaVersion:2,pages:[{pageKey:'observation',title:'Observation',questions:[{itemKey:'note',type:'SHORT_TEXT',prompt:'A concrete observation',required:true,options:[],rows:[]}]}]})
  const definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'STUDENT',responseMode:mode},instruction:'Observe the assigned student; do not answer for yourself.',blocks:[
   {blockId:randomUUID(),instruction:'Fixed observer Scale',source:{provider:'LIBRARY_SCALE',kind:'SCALE',versionId:f.entryId,contentHash:entry.hash}},
   {blockId:randomUUID(),instruction:'An unscored observation',source:{provider:'PRIVATE_VERSION',kind:'FORM',versionId:form.version.id,contentHash:form.version.contentHash}}]}
  const composition=await fixed('COMPOSITION',definition),run=`/organizations/${f.organizationId}/activities/${f.workflow.id}/runs/${f.runId}`
  const summaries=await request(author,composition.path+'/versions')
  expect(summaries.status,JSON.stringify(summaries.value)).toBe(200)
  expect(summaries.data.list[0]).toMatchObject({id:composition.version.id,administration:definition.administration})
  expect(summaries.data.list[0]).not.toHaveProperty('definition')
  const preview=await request(author,`${tools}/library-sources/${f.entryId}?contentHash=${entry.hash}&responseMode=${mode}`)
  expect(preview.status,JSON.stringify(preview.value)).toBe(200)
  expect(preview.data).toMatchObject({id:f.entryId,contentHash:entry.hash,kind:'SCALE',previewOnly:true,canEditOriginal:false})
  const body={expectedVersion:f.expectedVersion,privateComposition:{versionId:composition.version.id,contentHash:composition.version.contentHash},
   subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]},
   respondentSelector:mode==='PARENT_REPORT'?{kind:'RELATED_PARENT'}:{kind:'MEMBERSHIP_IDS',membershipIds:[f.participantMembershipId]},
   ...(mode==='TEACHER_REPORT'?{targetPolicy:{mode:'HOMEROOM_TEACHER'}}:{})}
  return {...f,tools,author,run,body,composition,definition}
 }
 it('parent compiles/fixes, receives a related-child assignment, consents, resumes and finalizes one Scale/Form questionnaire with private completion feedback',async()=>{
  const f=await prepare('PARENT_REPORT'),actor=f.participantUserId
  expect(f.composition.version.runtime.origin.variantKey).toBe('STUDENT:PARENT_REPORT')
  const bodies=vi.spyOn(sourceBodies,'readEducationLibrarySources')
  expect((await request(f.author,f.composition.path+'/freeze',f.composition.input)).data.runtime).toEqual(f.composition.version.runtime)
  expect((await request(f.schoolAdmin!.userId,f.tools,{kind:'COMPOSITION',title:'Not an authorized author'})).status).toBe(403)
  expect((await request(actor,f.tools)).status).toBe(403)
  expect((await request(f.author,f.run+'/tracks',{...f.body,respondentSelector:f.body.subjectSelector})).status).toBe(400)
  const added=await request(f.author,f.run+'/tracks',f.body);expect(added.status,JSON.stringify(added.value)).toBe(200)
  const preview=await request(f.author,f.run+'/preview',{expectedVersion:f.expectedVersion+1});expect(preview.status,JSON.stringify(preview.value)).toBe(200)
  expect(preview.data.tracks[0].executionCount).toBe(1)
  await f.open()
  const published=await request(f.author,f.run+'/publish',{expectedVersion:f.expectedVersion+1});expect(published.status,JSON.stringify(published.value)).toBe(200)
  const [execution]=await f.executions(),path=f.run+'/executions/'+execution.id
  const [assignment]=await db.$queryRaw<Array<{subject:string;respondent:string;consent:string|null;perspective:string;policy:any}>>`
   SELECT a.subject_user_id AS subject,a.respondent_user_id AS respondent,a.consent_id AS consent,a.perspective,t.frozen_resource_policy AS policy
   FROM assessment_run_executions e JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id
   JOIN assessment_run_tracks t ON t.id=e.track_id WHERE e.id=${execution.id}`
  expect(assignment).toMatchObject({subject:f.subjectUserId,respondent:actor,perspective:'OBSERVER_REPORT'})
  expect(assignment.consent).toBeTruthy();expect(assignment.policy.educationComposition.unitReports.every((unit:any)=>unit.respondent.mode==='NONE')).toBe(true)
  const parent=await db.user.findUniqueOrThrow({where:{id:actor}})
  const inbox=await listCampusParentRunTasks({userId:actor,username:parent.username,role:parent.role,accountDomain:'SCHOOL',tokenVersion:parent.tokenVersion,platformRole:parent.platformRole,mustChangePassword:parent.mustChangePassword})
  expect(inbox.list.find(task=>task.executionId===execution.id)).toMatchObject({consentRequired:true,feedbackMode:'COMPOSITION'})
  const pending=await request(actor,path+'/start',{});expect(pending.status,JSON.stringify(pending.value)).toBe(409)
  expect(pending.value).toMatchObject({code:-1,message:'current accepted consent is required before Run START'})
  expect(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:f.composition.version.runtime.compositeId}})).toBe(0)
  expect((await request(f.subjectUserId,path+'/consent/accept',{})).status).toBe(404)
  expect((await request(actor,path+'/consent/accept',{})).status).toBe(200)
  const start=await request(actor,path+'/start',{});expect(start.status,JSON.stringify(start.value)).toBe(200)
  const attempt=start.data.runtimeBindingRef,attemptPath='/composite-attempts/'+attempt
  expect(await db.compositeAssessmentAttempt.findUnique({where:{id:attempt},select:{userId:true,subjectUserId:true,respondentUserId:true}}))
   .toEqual({userId:actor,subjectUserId:f.subjectUserId,respondentUserId:actor})
  expect((await request(actor,path+'/start',{})).data).toMatchObject({runtimeBindingRef:attempt,replayed:true})
  for(let index=0;index<2;index++){
   const state=await request(actor,attemptPath+'?view=current-unit');expect(state.status,JSON.stringify(state.value)).toBe(200)
   const item=state.data.currentItem;expect(item.questionnaireInstruction).toBe(f.definition.blocks[index].instruction)
   const input={submissionId:randomUUID(),attemptEpoch:state.data.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:state.data.contextSnapshotHash,
    answers:index===0?item.scale.definition.items.map((q:any)=>({itemCode:q.itemCode,responseValue:'option_3'})):item.answers.map((q:any)=>({formItemId:q.formItemId,value:'Private parent observation'}))}
   const endpoint=attemptPath+(index===0?`/items/${item.id}/scale/submit`:`/form-sections/${item.formSectionId}/submit`)
   expect((await request(f.subjectUserId,endpoint,input)).status).toBe(404)
   const final=await request(actor,endpoint,input);expect(final.status,JSON.stringify(final.value)).toBe(200)
   expect((await request(actor,endpoint,input)).status).toBe(200)
  }
  expect((await request(actor,attemptPath)).data.status).toBe('COMPLETED')
  expect(await db.assessment.findMany({where:{compositeAttemptId:attempt},select:{userId:true,subjectUserId:true,respondentUserId:true,status:true}}))
   .toEqual([{userId:actor,subjectUserId:f.subjectUserId,respondentUserId:actor,status:'COMPLETED'}])
  const feedbackPath='/run-executions/'+execution.id+'/feedback',feedback=await request(actor,feedbackPath)
  expect(feedback.status,JSON.stringify(feedback.value)).toBe(200);expect(feedback.data.state).toBe('COMPLETION_ONLY')
  expect(feedback.data.units.map((unit:any)=>unit.state)).toEqual(['WITHHELD','COMPLETION_ONLY'])
  expect(JSON.stringify(feedback.data)).not.toMatch(/Private parent observation|scores|rawScore|sourceDefinition|manifestHash|educationComposition/)
  for(const other of [f.subjectUserId,f.author,f.schoolAdmin!.userId])expect((await request(other,feedbackPath)).status).toBe(404)
  expect(bodies).not.toHaveBeenCalled();bodies.mockRestore()
  await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:actor,permission:'REPORT_READ',reason:'Synthetic respondent report withdrawal',deniedByUserId:f.author}})
  expect((await request(actor,feedbackPath)).status).toBe(404)
 },60000)
 it('teacher observer requires a homeroom target and preserves the student through START, FINAL and restricted feedback',async()=>{
  const f=await prepare('TEACHER_REPORT')
  expect(f.composition.version.runtime.origin.variantKey).toBe('STUDENT:TEACHER_REPORT')
  const {targetPolicy:_,...withoutTarget}=f.body
  expect((await request(f.author,f.run+'/tracks',withoutTarget)).status).toBe(400)
  expect((await request(f.author,f.run+'/tracks',{...f.body,targetPolicy:{mode:'ALL_CLASS_TEACHERS'}})).status).toBe(403)
  const added=await request(f.author,f.run+'/tracks',f.body);expect(added.status,JSON.stringify(added.value)).toBe(200)
  await f.open();const published=await request(f.author,f.run+'/publish',{expectedVersion:f.expectedVersion+1});expect(published.status,JSON.stringify(published.value)).toBe(200)
  const [execution]=await f.executions(),path=f.run+'/executions/'+execution.id
  const [assignment]=await db.$queryRaw<Array<{consent:string|null}>>`SELECT a.consent_id AS consent FROM assessment_run_executions e JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id WHERE e.id=${execution.id}`
  if(assignment.consent)expect((await request(f.participantUserId,path+'/consent/accept',{})).status).toBe(200)
  const start=await request(f.participantUserId,path+'/start',{});expect(start.status,JSON.stringify(start.value)).toBe(200)
  expect(await db.compositeAssessmentAttempt.findUnique({where:{id:start.data.runtimeBindingRef},select:{userId:true,subjectUserId:true,respondentUserId:true}}))
   .toEqual({userId:f.participantUserId,subjectUserId:f.subjectUserId,respondentUserId:f.participantUserId})
  const attemptPath='/composite-attempts/'+start.data.runtimeBindingRef
  expect((await request(f.participantUserId,path+'/start',{})).data).toMatchObject({runtimeBindingRef:start.data.runtimeBindingRef,replayed:true})
  for(let index=0;index<2;index++){
   const state=await request(f.participantUserId,attemptPath+'?view=current-unit');expect(state.status,JSON.stringify(state.value)).toBe(200)
   const item=state.data.currentItem,input={submissionId:randomUUID(),attemptEpoch:state.data.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:state.data.contextSnapshotHash,
    answers:index===0?item.scale.definition.items.map((q:any)=>({itemCode:q.itemCode,responseValue:'option_3'})):item.answers.map((q:any)=>({formItemId:q.formItemId,value:'Private teacher observation'}))}
   const endpoint=attemptPath+(index===0?`/items/${item.id}/scale/submit`:`/form-sections/${item.formSectionId}/submit`)
   expect((await request(f.subjectUserId,endpoint,input)).status).toBe(404)
   const final=await request(f.participantUserId,endpoint,input);expect(final.status,JSON.stringify(final.value)).toBe(200)
  }
  const feedbackPath='/run-executions/'+execution.id+'/feedback',feedback=await request(f.participantUserId,feedbackPath)
  expect(feedback.status,JSON.stringify(feedback.value)).toBe(200)
  expect(feedback.data).toMatchObject({state:'COMPLETION_ONLY',units:[{state:'WITHHELD'},{state:'COMPLETION_ONLY'}]})
  expect(JSON.stringify(feedback.data)).not.toMatch(/Private teacher observation|scores|rawScore|sourceDefinition|manifestHash/)
  for(const other of [f.subjectUserId,f.author,f.schoolAdmin!.userId])expect((await request(other,feedbackPath)).status).toBe(404)
 },60000)
})
