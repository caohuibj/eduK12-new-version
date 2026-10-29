import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import {Prisma} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationLibraryRuntimeFixture} from './educationLibraryRuntimeFixture'
import * as tools from '../../modules/education-tools/private-tool.service'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {createDraft,updateDraft} from '../../modules/survey/builder.service'
import {submitOwnedSurveyTool,approveGovernedTool} from '../../modules/survey/governed-tool.service'
import {issueAdminContentRoot,revokeAdminContentGrant} from '../../modules/measurement-content/admin-authority.service'
import {educationPublicSourceKey} from '../../modules/education-tools/public-source.identity'
import {addTeacherPrivateCompositionRunTrack,publishTeacherRun} from '../../modules/huiteacher/run.service'
import {addPrivateCompositionRunTrack} from '../../modules/education-tools/private-tool.run-adapter'
import {createTeacherAssessmentRuntimeRouter} from '../../modules/huiteacher/assessmentRuntime.routes'
import {teacherAssessmentRuntimeSource} from '../../modules/huiteacher/assessmentRuntime.source'
import schoolActivityRouter from '../../modules/campus/activity.run.routes'
import schoolCompositeRouter from '../../modules/campus/composite.routes'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
import {listCampusStudentTasks} from '../../modules/campus/activity.tasks'
import {HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,SCHOOL_AUTH_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
suite('Public fixed Form / one ordinary education questionnaire',()=>{
 let server:Server,base:string,system:string,formId:string,formHash:string
 const proof=()=>({tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:'synthetic-form-source-session'})
 async function request(product:'SCHOOL'|'TEACHER',userId:string,path:string,body?:unknown){
  const user=await db.user.findUniqueOrThrow({where:{id:userId}}),csrf='synthetic-public-form-csrf',teacher=product==='TEACHER'
  const token=generateToken({userId,username:user.username,role:user.role,tokenVersion:user.tokenVersion,accountDomain:'SCHOOL',mfaVerifiedAt:Math.floor(Date.now()/1000),...(teacher?{sessionProduct:'HUITEACHER' as const}:{})})
  const response=await fetch(base+(teacher?'/api/huiteacher':'/api/campus')+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',
   cookie:`${teacher?HUITEACHER_AUTH_COOKIE_NAME:SCHOOL_AUTH_COOKIE_NAME}=${token}; ${teacher?HUITEACHER_CSRF_COOKIE_NAME:SCHOOL_CSRF_COOKIE_NAME}=${csrf}`,[CSRF_HEADER_NAME]:csrf},...(body===undefined?{}:{body:JSON.stringify(body)})})
  const value=await response.json();return {status:response.status,value,data:value.data}
 }
 async function freeze(c:PrivateToolContext,kind:'SCALE'|'COMPOSITION',title:string,definition:unknown){
  const draft=await tools.createPrivateTool(c,{kind,title}),saved=await tools.updatePrivateTool(c,draft.id,{expectedRevision:1,title,definition})
  return tools.freezePrivateTool(c,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
 }
 async function fixture(product:'SCHOOL'|'TEACHER'){
  const f=await setupEducationLibraryRuntimeFixture({db,product,trackCount:0,publish:false,...(product==='SCHOOL'?{publisher:'PSYCHOLOGY' as const}:{})})
  const c:PrivateToolContext={entry:product,organizationId:f.organizationId,principal:{userId:f.managerUserId,accountDomain:'SCHOOL'}}
  const publicSource={provider:'PUBLIC_FORM',kind:'FORM',versionId:formId,contentHash:formHash}
  const definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:product==='SCHOOL'?'STUDENT':'TEACHER',responseMode:'SELF'},instruction:'A real shared questionnaire',blocks:[{blockId:randomUUID(),instruction:'Public Form transition',source:publicSource}]}
  const draft=await tools.createPrivateTool(c,{kind:'COMPOSITION',title:'Not yet authorized'})
  const saved=await tools.updatePrivateTool(c,draft.id,{expectedRevision:1,title:'Not yet authorized',definition})
  await expect(tools.freezePrivateTool(c,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})).rejects.toMatchObject({code:'PUBLIC_SOURCE_USE_REQUIRED'})
  expect(await db.educationPrivateToolVersion.count({where:{toolId:draft.id}})).toBe(0)
  const grant=await issueAdminContentRoot(system,proof(),{requestId:randomUUID(),expectedVersion:0,reason:'Synthetic public Form permission',grant:{subjectId:f.managerUserId,
   scope:{product,scopeKind:'ORGANIZATION',scopeId:f.organizationId,resourceKind:'material',resourceKeys:[educationPublicSourceKey({kind:'FORM',id:formId,hash:formHash})]},
   capabilities:['material.use'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
  const scale=compileResearchScale('Native private Scale',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'yes',label:'Yes',score:1},{optionKey:'no',label:'No',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'scaleq',prompt:'Native Scale question',required:true,reverse:false,dimensionKeys:['total']}]})
  scale.report.audienceContract={schemaVersion:1,respondent:product==='SCHOOL'?'STUDENT_SELF':'ADULT_SELF',audience:product==='SCHOOL'?'student':'teacher',locale:'zh-CN'}
  const leaf=await freeze(c,'SCALE','Native private Scale',scale)
  const fixed=await freeze(c,'COMPOSITION','Scale plus exact public Form',{...definition,blocks:[{blockId:randomUUID(),instruction:'Private Scale transition',source:{provider:'PRIVATE_VERSION',kind:'SCALE',versionId:leaf.id,contentHash:leaf.contentHash}},...definition.blocks]})
  const second=await freeze(c,'COMPOSITION','Second use awaiting admission',definition)
  if(!('runtime' in fixed)||!fixed.runtime||!('runtime' in second)||!second.runtime)throw new Error('Missing real sealed runtime')
  for(const [index,source] of [fixed,second].entries()){
   const body={expectedVersion:f.expectedVersion+index,privateComposition:{versionId:source.id,contentHash:source.contentHash},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]}}
   if(product==='TEACHER')await addTeacherPrivateCompositionRunTrack({organizationId:f.organizationId,eventId:f.workflow.id,actorUserId:f.managerUserId},body)
   else await addPrivateCompositionRunTrack({organizationId:f.organizationId,runId:f.runId,actorUserId:f.managerUserId,parent:{kind:'SCHOOL_ACTIVITY',id:f.workflow.id}},body)
  }
  await f.open()
  if(product==='TEACHER')await publishTeacherRun({organizationId:f.organizationId,eventId:f.workflow.id,actorUserId:f.managerUserId,expectedVersion:f.expectedVersion+2})
  else await f.publish()
  const executions=await db.$queryRaw<Array<{id:string;key:string}>>(Prisma.sql`SELECT e.id,t.resource_key AS key FROM assessment_run_executions e JOIN assessment_run_tracks t ON t.id=e.track_id WHERE e.run_id=${f.runId}`)
  return {...f,c,grant,fixed,second,first:executions.find(e=>e.key===fixed.runtime.resourceKey)!.id,next:executions.find(e=>e.key===second.runtime.resourceKey)!.id}
 }
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!);vi.stubEnv('SURVEY_WORKSPACE_ENABLED','true');vi.stubEnv('SURVEY_PUBLICATION_ENABLED','true')
  system=(await db.user.create({data:{username:'formpubsys-'+randomUUID(),passwordHash:'synthetic',platformRole:'SYSTEM_ADMIN',accountDomain:'TRAINING'}})).id
  const owner=(await db.user.create({data:{username:'formpubauthor-'+randomUUID(),passwordHash:'synthetic',accountDomain:'SURVEY'}})).id,login='r'+randomUUID().replaceAll('-','').slice(0,18)
  await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}});await db.surveyResearcherGrant.create({data:{userId:owner,status:'ACTIVE',grantedBy:system}});await db.surveyMfaCredential.create({data:{userId:owner,enabled:true,secretCipher:'synthetic'}})
  const project=await db.surveyProject.create({data:{id:randomUUID(),ownerUserId:owner,title:'Original fixed public Form',collectionMode:'SINGLE_UNLINKED'}})
  const draft=await createDraft(owner,project.id,{requestId:randomUUID(),instrumentKey:'fixedform',kind:'FORM',title:'Original two-page public Form'})
  const saved=await updateDraft(owner,project.id,draft.id,{revision:draft.revision,title:draft.title,definition:{schemaVersion:2,pages:[
   {pageKey:'first',title:'Original first page',questions:[{itemKey:'firstchoice',type:'SINGLE',prompt:'First original choice',required:true,options:[{optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'}],rows:[]}]},
   {pageKey:'second',title:'Original second page',questions:[{itemKey:'comment',type:'SHORT_TEXT',prompt:'Original comment',required:true,options:[],rows:[]}]},
  ]}})
  const source=await submitOwnedSurveyTool(owner,project.id,draft.id,{requestId:randomUUID(),revision:saved.revision,version:'education-form-v1',statement:'Original author explicitly shares the fixed source',reference:{educationApplicability:{schemaVersion:1,administrations:[{population:'STUDENT',responseMode:'SELF'},{population:'TEACHER',responseMode:'SELF'}]},language:'zh-CN'}})
  expect((await approveGovernedTool(system,source.id,{expectedVersion:source.version,hash:source.hash,decision:'APPROVE',reason:'Synthetic original content approval',allowedProducts:['SURVEY']},proof())).state).toBe('ONLINE')
  formId=source.id;formHash=source.hash
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/huiteacher',createTeacherAssessmentRuntimeRouter(teacherAssessmentRuntimeSource));app.use('/api/campus',schoolActivityRouter,schoolCompositeRouter)
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}vi.unstubAllEnvs();await db.$disconnect()})
 it.each(['TEACHER','SCHOOL'] as const)('%s runs a private Scale + exact public Form once, preserves pages, and fences new admission after U withdrawal',async product=>{
  const f=await fixture(product),user=f.participantUserId
  const execution=(id:string)=>product==='TEACHER'?`/run-executions/${id}`:`/organizations/${f.organizationId}/activities/${f.workflow.id}/runs/${f.runId}/executions/${id}`
  const consent=product==='TEACHER'?'/assessment-consent/accept':'/consent/accept',start=product==='TEACHER'?'/start-assessment':'/start'
  const actor=await db.user.findUniqueOrThrow({where:{id:user}})
  const tasks=product==='TEACHER'?(await request(product,user,'/my-assessment-tasks')).data:
   await listCampusStudentTasks({userId:user,username:actor.username,role:actor.role,accountDomain:'SCHOOL',tokenVersion:actor.tokenVersion},{page:1,pageSize:20,activityId:f.workflow.id})
  const accept=async(id:string)=>{const task=tasks.list.find((task:any)=>(task.executionId??task.id)===id);expect(task).toBeDefined()
   if(task.consentRequired){const response=await request(product,user,execution(id)+consent,{});expect(response.status,JSON.stringify(response.value)).toBe(200)}}
  await accept(f.first)
  const entered=await request(product,user,execution(f.first)+start,{})
  expect(entered.status,JSON.stringify(entered.value)).toBe(200)
  const attempt=entered.data.runtimeBindingRef,path=(product==='TEACHER'?'/assessment-composite-attempts/':'/composite-attempts/')+attempt
  await revokeAdminContentGrant(system,proof(),f.grant.grantId,{expectedVersion:1,reason:'No additional uses of this public Form'})
  expect((await request(product,user,execution(f.first)+start,{})).data).toMatchObject({runtimeBindingRef:attempt,replayed:true})
  await accept(f.next)
  const denied=await request(product,user,execution(f.next)+start,{})
  expect(denied.status,JSON.stringify(denied.value)).toBe(403)
  const [pending]=await db.$queryRaw<Array<{binding:string|null}>>(Prisma.sql`SELECT runtime_binding_ref AS binding FROM assessment_run_executions WHERE id=${f.next}`)
  expect(pending.binding).toBeNull()
  for(let index=0;index<3;index++){
   const state=await request(product,user,path+'?view=current-unit')
   expect(state.status,JSON.stringify(state.value)).toBe(200);const item=state.data.currentItem;expect(state.data.totalItems).toBe(3)
   expect(item.type).toBe(index===0?'SCALE':'FORM_SECTION')
   if(index)expect(item.title).toBe(index===1?'Original first page':'Original second page')
   if(index===1)expect(item.questionnaireInstruction).toBe('Public Form transition')
   const common={submissionId:randomUUID(),attemptEpoch:state.data.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:state.data.contextSnapshotHash}
   const answers=index===0?item.scale.definition.items.map((q:any)=>({itemCode:q.itemCode,responseValue:'yes'})):
    item.answers.map((q:any)=>({formItemId:q.formItemId,value:index===1?'yes':'Original Form response'}))
   const endpoint=path+(index===0?`/items/${item.id}/scale/submit`:`/form-sections/${item.formSectionId}/submit`)
   const done=await request(product,user,endpoint,{...common,answers});expect(done.status,JSON.stringify(done.value)).toBe(200)
   expect((await request(product,user,endpoint,{...common,answers})).status).toBe(200)
  }
  const finished=await request(product,user,path);expect(finished.data.status).toBe('COMPLETED')
  const feedback=await request(product,user,`/run-executions/${f.first}/feedback`)
  expect(feedback.status,JSON.stringify(feedback.value)).toBe(200)
  expect(feedback.data.units.find((unit:any)=>unit.kind==='FORM')).toMatchObject({title:'Original two-page public Form',state:'COMPLETION_ONLY'})
  expect(await db.educationPrivateToolVersion.count({where:{entry:product,organizationId:f.organizationId,kind:'FORM'}})).toBe(0)
  const runtime=await db.compositeAssessment.findUniqueOrThrow({where:{id:f.fixed.runtime!.compositeId}}),binding=(runtime.trainingContentSnapshot as any).educationBinding
  expect(binding.manifest[1]).toMatchObject({sourceProvider:'PUBLIC_FORM',versionId:formId,contentHash:formHash,sectionIds:expect.any(Array)})
  expect(binding.manifest[1].sectionIds).toHaveLength(2)
 },60000)
})
