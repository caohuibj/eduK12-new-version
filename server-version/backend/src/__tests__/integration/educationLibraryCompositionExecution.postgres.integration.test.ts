import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import express from 'express'
import type {Server} from 'node:http'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationLibraryRuntimeFixture} from './educationLibraryRuntimeFixture'
import * as tools from '../../modules/education-tools/private-tool.service'
import * as sourceBodies from '../../modules/education-tools/library-source.scale'
import * as nativeRuntime from '../../modules/assessment-runtime/runtime-snapshot'
import * as nativePresentation from '../../modules/scale/scale-presentation'
import * as libraryAuthority from '../../modules/scale-library-governance/authority'
import {revokeUse} from '../../modules/scale-library-governance/distribution'
import {addPrivateCompositionRunTrack} from '../../modules/education-tools/private-tool.run-adapter'
import {educationPrivateToolRouter} from '../../modules/education-tools/private-tool.routes'
import {createTeacherAssessmentRuntimeRouter} from '../../modules/huiteacher/assessmentRuntime.routes'
import {teacherAssessmentRuntimeSource} from '../../modules/huiteacher/assessmentRuntime.source'
import schoolActivityRouter from '../../modules/campus/activity.run.routes'
import schoolCompositeRouter from '../../modules/campus/composite.routes'
import {listCampusStudentTasks} from '../../modules/campus/activity.tasks'
import {authenticateSchool,authenticateHuiteacher} from '../../middleware/auth'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
import {HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,SCHOOL_AUTH_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
suite('Original library U / actual ordinary SELF Scale-Form journey',()=>{
 let server:Server,base:string
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  for(const entry of ['TEACHER','SCHOOL'] as const)app.use(`/api/${entry==='TEACHER'?'huiteacher':'campus'}/organizations/:organizationId/private-tools`,entry==='TEACHER'?authenticateHuiteacher:authenticateSchool,educationPrivateToolRouter(entry))
  app.use('/api/huiteacher',createTeacherAssessmentRuntimeRouter(teacherAssessmentRuntimeSource));app.use('/api/campus',schoolActivityRouter,schoolCompositeRouter)
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 })
 afterAll(async()=>{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}vi.restoreAllMocks();await db.$disconnect()})
 async function request(product:'SCHOOL'|'TEACHER',userId:string,path:string,body?:unknown){
  const user=await db.user.findUniqueOrThrow({where:{id:userId}}),csrf='synthetic-library-self-csrf',teacher=product==='TEACHER'
  const token=generateToken({userId,username:user.username,role:user.role,tokenVersion:user.tokenVersion,accountDomain:'SCHOOL',mfaVerifiedAt:Math.floor(Date.now()/1000),...(teacher?{sessionProduct:'HUITEACHER' as const}:{})})
  const response=await fetch(base+(teacher?'/api/huiteacher':'/api/campus')+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',
   cookie:`${teacher?HUITEACHER_AUTH_COOKIE_NAME:SCHOOL_AUTH_COOKIE_NAME}=${token}; ${teacher?HUITEACHER_CSRF_COOKIE_NAME:SCHOOL_CSRF_COOKIE_NAME}=${csrf}`,[CSRF_HEADER_NAME]:csrf},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value=await response.json();return {status:response.status,value,data:value.data}
 }
 async function fixed(c:PrivateToolContext,kind:'FORM'|'COMPOSITION',definition:unknown){
  const draft=await tools.createPrivateTool(c,{kind,title:'Synthetic '+kind}),saved=await tools.updatePrivateTool(c,draft.id,{expectedRevision:1,title:draft.title,definition})
  return tools.freezePrivateTool(c,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
 }
 it.each(['TEACHER','SCHOOL'] as const)('%s enforces its distinct author identity, starts once, retains entered completion after U withdrawal, and isolates native same-key feedback',async product=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product,trackCount:0,publish:false,...(product==='SCHOOL'?{publisher:'PSYCHOLOGY' as const}:{})})
  const c:PrivateToolContext={entry:product,organizationId:f.organizationId,principal:{userId:f.managerUserId,accountDomain:'SCHOOL'}}
  const libraryPath=`/organizations/${f.organizationId}/private-tools/library-sources`
  expect((await request(product,f.managerUserId,libraryPath)).status).toBe(200)
  if(product==='TEACHER'){
   // Local psychology is sufficient in School only, never in Teacher.
   const member=f.participantMembershipId!
   await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:member,persona:'COUNSELOR',grantedByUserId:f.managerUserId}})
   await db.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:member,capability:'PSYCHOLOGY_STAFF',grantedByUserId:f.managerUserId}})
  }else expect((await request(product,f.schoolAdmin!.userId,libraryPath)).status).toBe(403)
  expect((await request(product,f.participantUserId,libraryPath)).status).toBe(403)
  const [entry]=await db.$queryRaw<Array<{hash:string}>>`SELECT s.snapshot_hash AS hash FROM scale_library_entries e JOIN scale_library_submissions s ON s.id=e.submission_id WHERE e.id=${f.entryId}`
  const form=await fixed(c,'FORM',{schemaVersion:2,pages:[{pageKey:'reflection',title:'Reflection',questions:[{itemKey:'note',type:'SHORT_TEXT',prompt:'A descriptive comment',required:true,options:[],rows:[]}]}]})
  const library={provider:'LIBRARY_SCALE',kind:'SCALE',versionId:f.entryId,contentHash:entry.hash},definition={schemaVersion:1,adapterVersion:'1.0.0',
   administration:{population:product==='SCHOOL'?'STUDENT':'TEACHER',responseMode:'SELF'},instruction:'Frozen ordinary questionnaire',blocks:[
    {blockId:randomUUID(),instruction:'First library transition',source:library},
    {blockId:randomUUID(),instruction:'Unscored Form transition',source:{provider:'PRIVATE_VERSION',kind:'FORM',versionId:form.id,contentHash:form.contentHash}},
    {blockId:randomUUID(),instruction:'Independent same-key transition',source:library}]}
  const versions=[await fixed(c,'COMPOSITION',definition),await fixed(c,'COMPOSITION',definition)]
  if(versions.some(version=>!('runtime'in version)||!version.runtime))throw new Error('Missing actual sealed sources')
  const bodies=vi.spyOn(sourceBodies,'readEducationLibrarySources')
  for(const [index,version] of versions.entries())await addPrivateCompositionRunTrack({organizationId:f.organizationId,runId:f.runId,actorUserId:f.managerUserId,parent:{kind:product==='TEACHER'?'TEACHER_EVENT':'SCHOOL_ACTIVITY',id:f.workflow.id}},
   {expectedVersion:f.expectedVersion+index,privateComposition:{versionId:version.id,contentHash:version.contentHash},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]}})
  await f.open();await f.publish()
  const executions=await db.$queryRaw<Array<{id:string;key:string}>>`SELECT e.id,t.resource_key AS key FROM assessment_run_executions e JOIN assessment_run_tracks t ON t.id=e.track_id WHERE e.run_id=${f.runId}`
  const first=executions.find(e=>e.key===(versions[0] as any).runtime.resourceKey)!.id,next=executions.find(e=>e.key===(versions[1] as any).runtime.resourceKey)!.id,user=f.participantUserId
  const execution=(id:string)=>product==='TEACHER'?`/run-executions/${id}`:`/organizations/${f.organizationId}/activities/${f.workflow.id}/runs/${f.runId}/executions/${id}`
  const start=product==='TEACHER'?'/start-assessment':'/start',consent=product==='TEACHER'?'/assessment-consent/accept':'/consent/accept'
  const actor=await db.user.findUniqueOrThrow({where:{id:user}}),tasks=product==='TEACHER'?(await request(product,user,'/my-assessment-tasks')).data:
   await listCampusStudentTasks({userId:user,username:actor.username,role:actor.role,accountDomain:'SCHOOL',tokenVersion:actor.tokenVersion},{page:1,pageSize:20,activityId:f.workflow.id})
  for(const id of [first,next]){const task=tasks.list.find((task:any)=>(task.executionId??task.id)===id);expect(task).toBeDefined()
   if(task.consentRequired)expect((await request(product,user,execution(id)+consent,{})).status).toBe(200)}
  const freezer=vi.spyOn(nativeRuntime,'freezeScaleRuntimeAtAttemptStart'),presentation=vi.spyOn(nativePresentation,'freezeLibraryScalePresentation')
  const entered=await request(product,user,execution(first)+start,{});expect(entered.status,JSON.stringify(entered.value)).toBe(200)
  expect(freezer).toHaveBeenCalledOnce();expect(presentation).not.toHaveBeenCalled();freezer.mockRestore();presentation.mockRestore()
  const attempt=entered.data.runtimeBindingRef,path=(product==='TEACHER'?'/assessment-composite-attempts/':'/composite-attempts/')+attempt
  await revokeUse(f.libraryAdminUserId,f.grantId,{expectedVersion:1,reason:'No new synthetic library use'})
  const issuer=vi.spyOn(libraryAuthority,'assertLibraryResourcesAuthority')
  expect((await request(product,user,execution(first)+start,{})).data).toMatchObject({runtimeBindingRef:attempt,replayed:true})
  const denied=await request(product,user,execution(next)+start,{});expect(denied.status,JSON.stringify(denied.value)).toBe(403)
  expect((await db.$queryRaw<Array<{binding:string|null}>>`SELECT runtime_binding_ref AS binding FROM assessment_run_executions WHERE id=${next}`)[0].binding).toBeNull()
  for(let index=0;index<3;index++){
   const state=await request(product,user,path+'?view=current-unit');expect(state.status,JSON.stringify(state.value)).toBe(200)
   const item=state.data.currentItem;expect(state.data.totalItems).toBe(3)
   expect(item.questionnaireInstruction).toBe(definition.blocks[index].instruction)
   const common={submissionId:randomUUID(),attemptEpoch:state.data.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:state.data.contextSnapshotHash}
   const answers=index===1?item.answers.map((q:any)=>({formItemId:q.formItemId,value:'A preserved unscored answer'})):
    item.scale.definition.items.map((q:any)=>({itemCode:q.itemCode,responseValue:index===0?'option_1':'option_3'}))
   const endpoint=path+(index===1?`/form-sections/${item.formSectionId}/submit`:`/items/${item.id}/scale/submit`)
   const done=await request(product,user,endpoint,{...common,answers});expect(done.status,JSON.stringify(done.value)).toBe(200)
   expect((await request(product,user,endpoint,{...common,answers})).status).toBe(200)
  }
  expect((await request(product,user,path)).data.status).toBe('COMPLETED')
  const feedback=await request(product,user,`/run-executions/${first}/feedback`);expect(feedback.status,JSON.stringify(feedback.value)).toBe(200)
  expect(feedback.data.units).toHaveLength(3)
  expect(feedback.data.units[1]).toMatchObject({kind:'FORM',state:'COMPLETION_ONLY'})
  expect(feedback.data.units[0].nativeScaleUnits[0].scores).toEqual([expect.objectContaining({key:'support',value:1})])
  expect(feedback.data.units[2].nativeScaleUnits[0].scores).toEqual([expect.objectContaining({key:'support',value:3})])
  expect(JSON.stringify(feedback.data)).not.toMatch(/trainingContent|referencePolicy|approvedSnapshotHash|sourceDefinitionHash|ownerId|canonicalResult/)
  expect((await request(product,f.managerUserId,`/run-executions/${first}/feedback`)).status).toBe(404)
  expect(bodies).not.toHaveBeenCalled();expect(issuer).not.toHaveBeenCalled();bodies.mockRestore();issuer.mockRestore()
 },60000)
})
