import {educationPrivateToolRouter} from '../../modules/education-tools/private-tool.routes'
import {authenticateSchool} from '../../middleware/auth'
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
import {issueAdminContentRoot,revokeAdminContentGrant} from '../../modules/measurement-content/admin-authority.service'
import {educationPublicSourceKey} from '../../modules/education-tools/public-source.identity'
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
suite('Exact approved Standard C/P/R in an ordinary education questionnaire',()=>{
 let server:Server,base:string,system:string,standardId:string,standardHash:string,original:any
 const KEY='domain_fixed_mindset_mathematics_zh_cn',VERSION='1.0.0'
 const proof=()=>({tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:'synthetic-standard-source-session'})
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
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  system=(await db.user.create({data:{username:'stdpubsys-'+randomUUID(),passwordHash:'synthetic',platformRole:'SYSTEM_ADMIN',accountDomain:'TRAINING'}})).id
  const registry=await import('../../modules/scale/onboarding/instrument-registry'),onboarding=await import('../../modules/scale/onboarding/install'),publication=await import('../../modules/scale/onboarding/publish')
  const source=registry.getScaleInstrumentSource(KEY,VERSION)!,runtime=registry.getScaleInstrumentRuntimePolicy(KEY,VERSION)!
  const install={instrumentKey:KEY,instrumentVersion:VERSION,actorUserId:system,deploymentPolicy:{schemaVersion:2 as const,revision:1,locale:'zh-CN',territory:source.scientificReview?.territory??'ZZ',
   deploymentModes:['STANDALONE','COMPOSITE','QUESTIONNAIRE'] as Array<'STANDALONE'|'COMPOSITE'|'QUESTIONNAIRE'>,runtimePolicyHash:runtime.runtimePolicyHash,localizationVersion:VERSION,inFlightCompletion:'FROZEN_DEADLINE' as const}}
  expect((await onboarding.planScaleInstrumentInstall(db,install)).blockers).toEqual([])
  await onboarding.installScaleInstrument(db,install)
  const pub={instrumentKey:KEY,instrumentVersion:VERSION,actorUserId:system,visibility:'HIDDEN' as const,allowedProducts:['SURVEY' as const]}
  const planned=await publication.planStandardScalePublication(db,pub);expect(planned.blockers).toEqual([])
  await publication.publishStandardScale(db,{...pub,expectedProofHash:planned.proofHash})
  const {sourceParts}=await import('../../modules/survey/standard-triplet.model'),{previewStandardTriplet,approveStandardTriplet,standardReleaseRow}=await import('../../modules/survey/standard-triplet.service')
  const parts=sourceParts(KEY,VERSION),selection={toolKey:KEY,CONTENT:parts.find(p=>p.axis==='CONTENT')!.hash,PARAMETERS:parts.find(p=>p.axis==='PARAMETERS')!.hash,REPORT:parts.find(p=>p.axis==='REPORT')!.hash}
  const triplet=await previewStandardTriplet(db,system,selection);expect(triplet.blockers).toEqual([])
  const online=await approveStandardTriplet(system,{...selection,requestId:randomUUID(),expectedCombinationHash:triplet.combinationHash,reason:'Synthetic exact source approval',allowedProducts:['SURVEY']},proof())
  standardId=online.id;standardHash=triplet.combinationHash;original=await standardReleaseRow(db,standardId)
  expect(await db.$queryRaw(Prisma.sql`SELECT id FROM survey_standard_trials WHERE release_id=${standardId}`)).toHaveLength(3)
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/campus/organizations/:organizationId/private-tools',authenticateSchool,educationPrivateToolRouter('SCHOOL'))
  app.use('/api/huiteacher',createTeacherAssessmentRuntimeRouter(teacherAssessmentRuntimeSource));app.use('/api/campus',schoolActivityRouter,schoolCompositeRouter)
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 },60000)
 afterAll(async()=>{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}vi.unstubAllEnvs();await db.$disconnect()})
 it('School SELF mixes native and exact declared reports; freezes P/R once, keeps same score keys separate, and fences new U after entry',async()=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product:'SCHOOL',trackCount:0,publish:false,publisher:'PSYCHOLOGY'})
  const c:PrivateToolContext={entry:'SCHOOL',organizationId:f.organizationId,principal:{userId:f.managerUserId,accountDomain:'SCHOOL'}}
  const publicSource={provider:'STANDARD_SCALE',kind:'SCALE',versionId:standardId,contentHash:standardHash}
  const definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'STUDENT',responseMode:'SELF'},instruction:'One real ordinary questionnaire',
   blocks:[{blockId:randomUUID(),instruction:'Exact public transition',source:publicSource}]}
  await expect(freeze(c,'COMPOSITION','No U',definition)).rejects.toMatchObject({code:'PUBLIC_SOURCE_USE_REQUIRED'})
  const grant=await issueAdminContentRoot(system,proof(),{requestId:randomUUID(),expectedVersion:0,reason:'Synthetic education exact use',grant:{subjectId:f.managerUserId,
   scope:{product:'SCHOOL',scopeKind:'ORGANIZATION',scopeId:f.organizationId,resourceKind:'material',resourceKeys:[educationPublicSourceKey({kind:'STANDARD_SCALE',id:standardId,hash:standardHash})]},
   capabilities:['material.use'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
  const catalogue=await (await import('../../modules/education-tools/public-source.catalog')).listEducationPublicSources(c,{kind:'SCALE'})
  expect(catalogue.list.find(row=>row.sourceId===standardId)).toMatchObject({allowedActions:['REFERENCE_FIXED_VERSION'],requiredContextKeys:['gradeLevel'],referenceContextKeys:expect.arrayContaining(['gradeLevel','primaryLanguage'])})
  const sourcePath=`/organizations/${f.organizationId}/private-tools/public-sources/standard/${standardId}?contentHash=${standardHash}`
  const preview=await request('SCHOOL',f.managerUserId,sourcePath);expect(preview.status,JSON.stringify(preview.value)).toBe(200)
  expect(preview.data.definition.items.length).toBe(original.snapshot.definition.items.length)
  expect(JSON.stringify(preview.data)).not.toMatch(/referencePolicy|scoring|interpretations|thresholds/)
  const wrongHash=await request('SCHOOL',f.managerUserId,sourcePath.replace(standardHash,'a'.repeat(64)));expect(wrongHash.status).toBe(403)
  expect((await request('SCHOOL',f.participantUserId,sourcePath)).status).toBe(403)
  await expect(freeze(c,'COMPOSITION','No explicit required context',definition)).rejects.toMatchObject({code:'PRIVATE_COMPOSITION_CONTEXT_REQUIRED'})
  const scoreKey=original.snapshot.definition.scoring.scores[0].key
  const privateScale=compileResearchScale('Independent same score key',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'yes',label:'Yes',score:1},{optionKey:'no',label:'No',score:2}],dimensions:[{dimensionKey:scoreKey,label:'Private independent score',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Independent native question',required:true,reverse:false,dimensionKeys:[scoreKey]}]})
  privateScale.report.audienceContract={schemaVersion:1,respondent:'STUDENT_SELF',audience:'student',locale:'zh-CN'}
  const leaf=await freeze(c,'SCALE','Independent same score key',privateScale)
  const contextFields=[{contextKey:'gradeLevel',formType:'single_choice',formLabel:'年级',formOptions:[{value:'7',label:'七年级'}]},
   {contextKey:'primaryLanguage',formType:'single_choice',formLabel:'主要语言',formOptions:[{value:'zh-CN',label:'中文'}]}]
  const fixed=await freeze(c,'COMPOSITION','Native and declared precise questionnaire',{...definition,contextFields,blocks:[
   {blockId:randomUUID(),instruction:'Native transition',source:{provider:'PRIVATE_VERSION',kind:'SCALE',versionId:leaf.id,contentHash:leaf.contentHash}},...definition.blocks]})
  const second=await freeze(c,'COMPOSITION','Awaiting another admission',{...definition,contextFields})
  if(!('runtime'in fixed)||!fixed.runtime||!('runtime'in second)||!second.runtime)throw new Error('Missing sealed source')
  const stored=await db.compositeAssessment.findUniqueOrThrow({where:{id:fixed.runtime.compositeId}}),snapshot=stored.trainingContentSnapshot as any
  const exact=snapshot.units.find((unit:any)=>unit.source.educationStandard)
  expect(exact.source.educationStandard).toMatchObject({releaseId:standardId,combinationHash:standardHash,parametersAxisHash:original.snapshot.parts.PARAMETERS.hash,reportAxisHash:original.snapshot.parts.REPORT.hash,reportAudience:'student'})
  expect(exact.referencePolicy.choices.length).toBeGreaterThan(0);expect(exact.report).toBeTruthy()
  expect(await db.compositeAssessment.count({where:{creationKey:{startsWith:'education-composition:SCHOOL:'},createdBy:f.managerUserId}})).toBe(2)
  for(const [index,version] of [fixed,second].entries())await addPrivateCompositionRunTrack({organizationId:f.organizationId,runId:f.runId,actorUserId:f.managerUserId,parent:{kind:'SCHOOL_ACTIVITY',id:f.workflow.id}},
   {expectedVersion:f.expectedVersion+index,privateComposition:{versionId:version.id,contentHash:version.contentHash},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]}})
  await f.open();await f.publish()
  const executions=await db.$queryRaw<Array<{id:string;key:string}>>(Prisma.sql`SELECT e.id,t.resource_key AS key FROM assessment_run_executions e JOIN assessment_run_tracks t ON t.id=e.track_id WHERE e.run_id=${f.runId}`)
  const first=executions.find(e=>e.key===fixed.runtime!.resourceKey)!.id,next=executions.find(e=>e.key===second.runtime!.resourceKey)!.id,user=f.participantUserId
  const execution=(id:string)=>`/organizations/${f.organizationId}/activities/${f.workflow.id}/runs/${f.runId}/executions/${id}`
  const actor=await db.user.findUniqueOrThrow({where:{id:user}}),tasks=await listCampusStudentTasks({userId:user,username:actor.username,role:actor.role,accountDomain:'SCHOOL',tokenVersion:actor.tokenVersion},{page:1,pageSize:20,activityId:f.workflow.id})
  for(const id of [first,next])if(tasks.list.find((task:any)=>(task.executionId??task.id)===id)?.consentRequired)expect((await request('SCHOOL',user,execution(id)+'/consent/accept',{})).status).toBe(200)
  const entered=await request('SCHOOL',user,execution(first)+'/start',{});expect(entered.status,JSON.stringify(entered.value)).toBe(200)
  const attempt=entered.data.runtimeBindingRef,path='/composite-attempts/'+attempt
  await revokeAdminContentGrant(system,proof(),grant.grantId,{expectedVersion:1,reason:'No new Standard admission'})
  expect((await request('SCHOOL',user,execution(first)+'/start',{})).data).toMatchObject({runtimeBindingRef:attempt,replayed:true})
  const denied=await request('SCHOOL',user,execution(next)+'/start',{});expect(denied.status,JSON.stringify(denied.value)).toBe(403)
  for(let index=0;index<3;index++){
   const state=await request('SCHOOL',user,path+'?view=current-unit');expect(state.status,JSON.stringify(state.value)).toBe(200)
   const item=state.data.currentItem;expect(state.data.totalItems).toBe(3)
   const common={submissionId:randomUUID(),attemptEpoch:state.data.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:state.data.contextSnapshotHash}
   const answers=index===0?item.answers.map((q:any)=>({formItemId:q.formItemId,value:q.contextKey==='gradeLevel'?'7':'zh-CN'})):item.scale.definition.items.map((q:any)=>({itemCode:q.itemCode,responseValue:index===1?'yes':'3'}))
   const endpoint=path+(index===0?`/form-sections/${item.formSectionId}/submit`:`/items/${item.id}/scale/submit`)
   const done=await request('SCHOOL',user,endpoint,{...common,answers});expect(done.status,JSON.stringify(done.value)).toBe(200)
   expect((await request('SCHOOL',user,endpoint,{...common,answers})).status).toBe(200)
  }
  const finished=await request('SCHOOL',user,path);expect(finished.data.status).toBe('COMPLETED')
  const feedback=await request('SCHOOL',user,`/run-executions/${first}/feedback`);expect(feedback.status,JSON.stringify(feedback.value)).toBe(200)
  expect(feedback.data.units).toHaveLength(2)
  expect(feedback.data.units[0]).toMatchObject({state:'READY',nativeScaleUnits:expect.any(Array)})
  expect(feedback.data.units[1]).toMatchObject({state:'READY',declaredReport:{blocks:expect.any(Array)}})
  expect(feedback.data.units[1].nativeScaleUnits).toBeUndefined()
  expect(JSON.stringify(feedback.data)).not.toMatch(/trainingContent|referencePolicy|combinationHash|ownerId|sampleIds|canonicalResult|template/)
  const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attempt}}),binding=parent.trainingContentBinding as any
  expect(binding.units[1].source.educationStandard).toEqual(exact.source.educationStandard)
  expect((parent.trainingReferenceBinding as any).units[1].references.some((r:any)=>r.status==='SELECTED')).toBe(true)
  const after=await db.$queryRaw<Array<{snapshot:unknown}>>(Prisma.sql`SELECT snapshot FROM survey_standard_releases WHERE id=${standardId}`)
  expect(after[0].snapshot).toEqual(original.snapshot)
 },60000)
})
