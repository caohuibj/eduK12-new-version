/** Two real task lifecycles over the retained approved source. This is an exact
 * authorization adapter check, not scientific qualification or UI approval. */
import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import type {Server} from 'node:http'
import {Prisma} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,SCHOOL_AUTH_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'
const suite=process.env.PRECISE_EDUCATION_SELECTED_LIFECYCLE==='1'?describe:describe.skip
suite('School and Teacher exact original-use task lifecycle, isolated PostgreSQL',()=>{
 let db:any,system:any,original:any,base='',server:Server|undefined,sign:any
 const requests:any[]=[],results:any[]=[]
 const proof=()=>({tokenVersion:system.tokenVersion,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
 async function request(product:'SCHOOL'|'TEACHER',userId:string,path:string,body?:unknown,status=200){
  const actor=await db.user.findUniqueOrThrow({where:{id:userId}}),teacher=product==='TEACHER',csrf='synthetic-selected-lifecycle'
  const token=sign({userId,username:actor.username,role:actor.role,tokenVersion:actor.tokenVersion,accountDomain:'SCHOOL',
   mfaVerifiedAt:Math.floor(Date.now()/1000),...(teacher?{sessionProduct:'HUITEACHER'}:{})})
  const response=await fetch(base+(teacher?'/api/huiteacher':'/api/campus')+path,{method:body===undefined?'GET':'POST',headers:{
   'Content-Type':'application/json',Cookie:(teacher?HUITEACHER_AUTH_COOKIE_NAME:SCHOOL_AUTH_COOKIE_NAME)+'='+token+'; '+(teacher?HUITEACHER_CSRF_COOKIE_NAME:SCHOOL_CSRF_COOKIE_NAME)+'='+csrf,
   [CSRF_HEADER_NAME]:csrf},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value=await response.json() as any;requests.push({product,path,status:response.status})
  expect(response.status,JSON.stringify(value)).toBe(status);return value.data
 }
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit local source clone required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_education_lifecycle_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated new lifecycle fixture required')
  db=(await import('../../config/database')).prisma
  const [{count:runs}]=await db.$queryRaw`SELECT count(*) FROM assessment_runs`
  if(await db.user.count()!==8||Number(runs)||await db.educationPrivateTool.count())throw Error('Inspect previous outcomes before retry')
  system=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN'}})
  ;[original]=await db.$queryRaw`SELECT id,combination_hash,snapshot,measurement_release FROM survey_standard_releases WHERE state='ONLINE'`
  expect(original.snapshot.toolKey).toBe('academic_self_concept_biology_zh_cn')
  sign=(await import('../../utils/jwt')).generateToken
  const express=(await import('express')).default,app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
  app.use('/api/huiteacher',(await import('../../modules/huiteacher/assessmentRuntime.routes')).createTeacherAssessmentRuntimeRouter(
   (await import('../../modules/huiteacher/assessmentRuntime.source')).teacherAssessmentRuntimeSource))
  app.use('/api/campus',(await import('../../modules/campus/activity.run.routes')).default,(await import('../../modules/campus/composite.routes')).default)
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },30000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_EDUCATION_SELECTED_LIFECYCLE_EVIDENCE??'/tmp/education-selected-lifecycle.json',JSON.stringify({productionAccessed:false,
   source:original?.id,scope:'Exact grant + actual private freeze/Run publication/START/FINAL/report; no admin browser',requests,results},null,2)+'\n')
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()))}
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it.each(['SCHOOL','TEACHER'] as const)('%s keeps the selected use through publication, revoke, entered completion and report ACL',async product=>{
  const {setupEducationLibraryRuntimeFixture}=await import('../integration/educationLibraryRuntimeFixture')
  const f=await setupEducationLibraryRuntimeFixture({db,product,trackCount:0,publish:false,...(product==='SCHOOL'?{publisher:'PSYCHOLOGY' as const}:{})})
  const manager=await db.user.create({data:{username:'exact-manager-'+randomUUID(),passwordHash:'!synthetic-no-login',accountDomain:'TRAINING',role:'STUDENT'}})
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:manager.id,entry:product==='SCHOOL'?'HUISCHOOL':'HUITEACHER',grantedBy:system.id}})
  const authority=await import('../../modules/measurement-content/admin-authority.service')
  const root=await authority.issueAdminContentRoot(system.id,proof(),{requestId:randomUUID(),expectedVersion:0,reason:'Exact synthetic school/source manager distribution',
   grant:{subjectId:manager.id,scope:{product,scopeKind:'ORGANIZATION',scopeId:f.organizationId,resourceKind:'material',resourceKeys:[original.measurement_release.releaseId]},
    capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}})
  const use=await (await import('../../modules/assessment-authorization/education-standard-use')).grantEducationStandardConfigurationUse(manager.id,
   {product,organizationId:f.organizationId},original.id,{requestId:randomUUID(),userId:f.managerUserId,combinationHash:original.combination_hash,
    authorityGrantId:root.grantId,expectedAuthorityVersion:1,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2090-01-01T00:00:00Z'})
  const audit=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:use.id}})
  const pin=(await import('../../modules/assessment-authorization/standard-configuration-binding')).selectedConfigurationPointer(audit.metadata.selectedBinding)
  const c={entry:product,organizationId:f.organizationId,principal:{userId:f.managerUserId,accountDomain:'SCHOOL' as const}}
  const tools=await import('../../modules/education-tools/private-tool.service')
  const definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:product==='SCHOOL'?'STUDENT':'TEACHER',responseMode:'SELF'},instruction:'Exact original configuration',
   contextFields:[{contextKey:'gradeLevel',formType:'single_choice',formLabel:'年级',formOptions:[{value:'7',label:'七年级'}]},
    {contextKey:'primaryLanguage',formType:'single_choice',formLabel:'主要语言',formOptions:[{value:'zh-CN',label:'中文'}]}],
   blocks:[{blockId:randomUUID(),instruction:'Frozen exact scale',source:{provider:'STANDARD_SCALE',kind:'SCALE',versionId:original.id,contentHash:original.combination_hash,selectedBinding:pin}}]}
  const versions:any[]=[]
  for(let index=0;index<2;index++){
   const draft=await tools.createPrivateTool(c,{kind:'COMPOSITION',title:'Synthetic exact '+product+' '+index})
   const saved=await tools.updatePrivateTool(c,draft.id,{expectedRevision:1,title:draft.title,definition})
   const fixed=await tools.freezePrivateTool(c,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
   if(!('runtime'in fixed)||!fixed.runtime)throw Error('Actual sealed source required');versions.push(fixed)
   const body={expectedVersion:f.expectedVersion+index,privateComposition:{versionId:fixed.id,contentHash:fixed.contentHash},
    subjectSelector:{kind:'MEMBERSHIP_IDS' as const,membershipIds:[f.subjectMembershipId]},respondentSelector:{kind:'MEMBERSHIP_IDS' as const,membershipIds:[f.subjectMembershipId]}}
   if(product==='TEACHER')await (await import('../../modules/huiteacher/run.service')).addTeacherPrivateCompositionRunTrack({organizationId:f.organizationId,eventId:f.workflow.id,actorUserId:f.managerUserId},body)
   else await (await import('../../modules/education-tools/private-tool.run-adapter')).addPrivateCompositionRunTrack({organizationId:f.organizationId,runId:f.runId,actorUserId:f.managerUserId,parent:{kind:'SCHOOL_ACTIVITY',id:f.workflow.id}},body)
  }
  await f.open()
  if(product==='TEACHER')await (await import('../../modules/huiteacher/run.service')).publishTeacherRun({organizationId:f.organizationId,eventId:f.workflow.id,actorUserId:f.managerUserId,expectedVersion:f.expectedVersion+2})
  else await f.publish()
  const executions=await db.$queryRaw(Prisma.sql`SELECT e.id,t.resource_key AS key FROM assessment_run_executions e JOIN assessment_run_tracks t ON t.id=e.track_id WHERE e.run_id=${f.runId}`)
  const enteredId=executions.find((e:any)=>e.key===versions[0].runtime.resourceKey).id,waitingId=executions.find((e:any)=>e.key===versions[1].runtime.resourceKey).id,user=f.participantUserId
  const execution=(id:string)=>product==='SCHOOL'?`/organizations/${f.organizationId}/activities/${f.workflow.id}/runs/${f.runId}/executions/${id}`:`/run-executions/${id}`
  const start=(id:string)=>execution(id)+(product==='SCHOOL'?'/start':'/start-assessment')
  const taskList=product==='TEACHER'?(await request(product,user,'/my-assessment-tasks')).list:await (async()=>{
   const actor=await db.user.findUniqueOrThrow({where:{id:user}})
   return (await (await import('../../modules/campus/activity.tasks')).listCampusStudentTasks({userId:user,username:actor.username,role:actor.role,accountDomain:'SCHOOL',tokenVersion:actor.tokenVersion,
    platformRole:actor.platformRole,mustChangePassword:actor.mustChangePassword},{page:1,pageSize:20,activityId:f.workflow.id})).list
  })()
  for(const id of [enteredId,waitingId])if(taskList.find((task:any)=>(task.executionId??task.id)===id)?.consentRequired)
   await request(product,user,execution(id)+(product==='SCHOOL'?'/consent/accept':'/assessment-consent/accept'),{})
  const entered=await request(product,user,start(enteredId),{}),attempt=entered.runtimeBindingRef
  await authority.revokeAdminContentGrant(system.id,proof(),use.id,{expectedVersion:1,reason:'Exact selected use ordinary withdrawal'})
  expect(await request(product,user,start(enteredId),{})).toMatchObject({runtimeBindingRef:attempt,replayed:true})
  await request(product,user,start(waitingId),{},403)
  const attemptPath=(product==='SCHOOL'?'/composite-attempts/':'/assessment-composite-attempts/')+attempt
  for(let index=0;index<2;index++){
   const state=await request(product,user,attemptPath+'?view=current-unit'),item=state.currentItem
   expect(state.totalItems).toBe(2)
   const common={submissionId:randomUUID(),attemptEpoch:state.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:state.contextSnapshotHash}
   const answers=index===0?item.answers.map((q:any)=>({formItemId:q.formItemId,value:q.contextKey==='gradeLevel'?'7':'zh-CN'})):
    item.scale.definition.items.map((q:any)=>({itemCode:q.itemCode,responseValue:'3'}))
   await request(product,user,attemptPath+(index===0?`/form-sections/${item.formSectionId}/submit`:`/items/${item.id}/scale/submit`),{...common,answers})
  }
  expect((await request(product,user,attemptPath)).status).toBe('COMPLETED')
  const report=await request(product,user,`/run-executions/${enteredId}/feedback`)
  expect(report.state).toBe(product==='SCHOOL'?'READY':'COMPLETION_ONLY');expect(report.units).toHaveLength(1)
  expect(report.units[0].state).toBe(product==='SCHOOL'?'READY':'WITHHELD') // The original source declares a student report audience.
  const historical=await tools.readPrivateToolVersion(c,versions[0].toolId,versions[0].id)
  expect((historical.definition as any).blocks[0].source.selectedBinding).toEqual(pin)
  expect(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:versions[1].runtime.compositeId}})).toBe(0)
  results.push({product,runId:f.runId,enteredId,waitingId,attempt,useId:use.id,bindingHash:pin.bindingHash,reportUnitState:report.units[0].state})
 },60000)
})
