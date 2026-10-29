import {randomUUID} from 'node:crypto'
import * as scaleAdmission from '../../modules/scale/scale-admission.service'
import * as collectionGuard from '../../modules/scale/scale-collection-guard'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {createTemplate,saveTemplate,completeTemplate} from '../../modules/survey/tool-library.service'
import {publishToolMeasurement} from '../../modules/survey/tool-publication.service'
import {submit,review} from '../../modules/scale-library-governance/service'
import {grantEducationLibraryUseInTransaction} from '../../modules/scale-library-governance/education-distribution'
import express from 'express'
import type {Server} from 'node:http'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationLibraryRuntimeFixture} from './educationLibraryRuntimeFixture'
import * as tools from '../../modules/education-tools/private-tool.service'
import * as nativeRuntime from '../../modules/assessment-runtime/runtime-snapshot'
import {addPrivateCompositionRunTrack} from '../../modules/education-tools/private-tool.run-adapter'
import schoolActivityRouter from '../../modules/campus/activity.run.routes'
import schoolCompositeRouter from '../../modules/campus/composite.routes'
import {listCampusStudentTasks} from '../../modules/campus/activity.tasks'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
import {HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,SCHOOL_AUTH_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
suite('School ordinary questionnaires / concurrent first library delivery',()=>{
 let server:Server,base:string
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/campus',schoolActivityRouter,schoolCompositeRouter)
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
 async function fixed(c:PrivateToolContext,kind:'SCALE'|'FORM'|'COMPOSITION',definition:unknown){
  const draft=await tools.createPrivateTool(c,{kind,title:'Synthetic '+kind}),saved=await tools.updatePrivateTool(c,draft.id,{expectedRevision:1,title:draft.title,definition})
  return tools.freezePrivateTool(c,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
 }
 it('serializes two first V1 deliveries after private Scale and Form without replacing frozen identity',async()=>{
  let libraryChildId=''
  const returnedHashes:string[]=[]
  const realAdmission=scaleAdmission.ensureScaleAdmissionAtDelivery
  vi.spyOn(scaleAdmission,'ensureScaleAdmissionAtDelivery').mockImplementation(async(...args:Parameters<typeof realAdmission>)=>{
   const admission=await realAdmission(...args)
   if(args[0]===libraryChildId)returnedHashes.push(admission.snapshotHash)
   return admission
  })
  // Both requests may finish the real shared-lock guard before either writes.
  // Release after 500 ms too, so correct row-lock serialization never waits
  // for a second request that is properly blocked before the shared guard.
  let concurrentDelivery=false,arrivals=0,unblock!:()=>void,releaseTimer:ReturnType<typeof setTimeout>|undefined
  const overlap=new Promise<void>(resolve=>{unblock=resolve})
  const realCollection=collectionGuard.assertTrainingScaleCollectionAllowed
  vi.spyOn(collectionGuard,'assertTrainingScaleCollectionAllowed').mockImplementation(async(...args:Parameters<typeof realCollection>)=>{
   await realCollection(...args)
   if(concurrentDelivery){arrivals++;if(arrivals===1)releaseTimer=setTimeout(unblock,500);else{if(releaseTimer)clearTimeout(releaseTimer);unblock()}await overlap}
  })
  const product='SCHOOL' as const
  const f=await setupEducationLibraryRuntimeFixture({db,product,trackCount:0,publish:false,publisher:'PSYCHOLOGY'})
  const admin=await db.user.create({data:{username:'diag_admin_'+randomUUID(),passwordHash:'synthetic-only',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})
  const author=await db.user.create({data:{username:'diag_author_'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SURVEY'}})
  const login='diag'+randomUUID().replaceAll('-','').slice(0,20)
  await db.surveyAccount.create({data:{userId:author.id,loginName:login,normalizedLogin:login}})
  await db.surveyResearcherGrant.create({data:{userId:author.id,status:'ACTIVE',grantedBy:admin.id}})
  await db.surveyMfaCredential.create({data:{userId:author.id,enabled:true,secretCipher:'synthetic-not-a-login-secret'}})
  const draft=await createTemplate(author.id,{requestId:randomUUID(),kind:'SCALE',title:'Synthetic published signed source'})
  const saved=await saveTemplate(author.id,draft.id,{revision:draft.revision,title:draft.title,definition:{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',
   responseOptions:[{optionKey:'low',label:'Shared low',score:-0.5},{optionKey:'high',label:'Shared high',score:1.5}],
   dimensions:[{dimensionKey:'support',label:'Independent support',direction:'descriptive'}],
   items:[{itemKey:'shared_q',prompt:'Synthetic shared question',required:true,reverse:false,dimensionKeys:['support']}],
   rawScoreFeedback:{schemaVersion:1,rules:[{scoreKey:'support',ranges:[{key:'all',min:-1,max:2,includeMax:true,text:'Synthetic native source feedback.'}]}]},
  }})
  await completeTemplate(author.id,saved.id,saved.revision)
  const release=await publishToolMeasurement(author.id,saved.id,saved.revision)
  const application=await submit(author.id,'SURVEY',{requestId:randomUUID(),releaseId:release.releaseId,metadata:{title:saved.title,author:'Synthetic author',copyright:'Self authored; redistribution allowed',applicability:'Isolated diagnosis',scoringDescription:'Original signed mean',reportDescription:'Native source feedback'},educationApplicability:{schemaVersion:1,administrations:[{population:'STUDENT',responseMode:'SELF'},{population:'TEACHER',responseMode:'SELF'}]}})
  const approved=await review(admin.id,application.id,{expectedVersion:1,decision:'APPROVE',allowedProducts:['SURVEY','TRAINING'],reason:'Synthetic source diagnosis'})
  if(!approved.entryId)throw new Error('Missing real approval entry')
  await db.$transaction(tx=>grantEducationLibraryUseInTransaction(tx,admin.id,approved.entryId!,{requestId:randomUUID(),product,organizationId:f.organizationId,scopeKind:'ORGANIZATION',userId:null}))
  const [row]=await db.$queryRaw<Array<{hash:string}>>`SELECT s.snapshot_hash AS hash FROM scale_library_entries e JOIN scale_library_submissions s ON s.id=e.submission_id WHERE e.id=${approved.entryId}`
  const c:PrivateToolContext={entry:product,organizationId:f.organizationId,principal:{userId:f.managerUserId,accountDomain:'SCHOOL'}}
  const privateDefinition=compileResearchScale('Synthetic private source',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'Private low',score:1},{optionKey:'b',label:'Private high',score:2}],dimensions:[{dimensionKey:'support',label:'Support',direction:'descriptive'}],items:[{itemKey:'support_item',prompt:'Private support question',required:true,reverse:false,dimensionKeys:['support']}]})
  const privateVersion=await fixed(c,'SCALE',privateDefinition)
  const formVersion=await fixed(c,'FORM',{schemaVersion:2,pages:[{pageKey:'reflection',title:'Synthetic reflection',questions:[{itemKey:'reflection',type:'SHORT_TEXT',prompt:'Synthetic reflection',required:true,options:[],rows:[]}]}]})
  const version=await fixed(c,'COMPOSITION',{schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'STUDENT',responseMode:'SELF'},instruction:'Frozen synthetic published source',blocks:[
   {blockId:randomUUID(),instruction:'Private source',source:{provider:'PRIVATE_VERSION',kind:'SCALE',versionId:privateVersion.id,contentHash:privateVersion.contentHash}},
   {blockId:randomUUID(),instruction:'Unscored reflection',source:{provider:'PRIVATE_VERSION',kind:'FORM',versionId:formVersion.id,contentHash:formVersion.contentHash}},
   {blockId:randomUUID(),instruction:'Original source',source:{provider:'LIBRARY_SCALE',kind:'SCALE',versionId:approved.entryId,contentHash:row.hash}},
  ]})
  if(!('runtime'in version)||!version.runtime)throw new Error('Missing sealed source')
  await addPrivateCompositionRunTrack({organizationId:f.organizationId,runId:f.runId,actorUserId:f.managerUserId,parent:{kind:'SCHOOL_ACTIVITY',id:f.workflow.id}},{expectedVersion:f.expectedVersion,privateComposition:{versionId:version.id,contentHash:version.contentHash},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]}})
  await f.open();await f.publish()
  const [execution]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM assessment_run_executions WHERE run_id=${f.runId}`
  const ep=`/organizations/${f.organizationId}/activities/${f.workflow.id}/runs/${f.runId}/executions/${execution.id}`
  const user=await db.user.findUniqueOrThrow({where:{id:f.participantUserId}})
  const tasks=await listCampusStudentTasks({userId:user.id,username:user.username,role:user.role,accountDomain:'SCHOOL',tokenVersion:user.tokenVersion},{page:1,pageSize:20,activityId:f.workflow.id})
  const task=tasks.list.find((task:any)=>(task.executionId??task.id)===execution.id);expect(task).toBeDefined()
  if(task.consentRequired){const consent=await request(product,f.participantUserId,ep+'/consent/accept',{});expect(consent.status,JSON.stringify(consent.value)).toBe(200)}
  const start=await request(product,f.participantUserId,ep+'/start',{});expect(start.status,JSON.stringify(start.value)).toBe(200)
  const path='/composite-attempts/'+start.data.runtimeBindingRef
  for(let index=0;index<2;index++){
   const state=await request(product,f.participantUserId,path+'?view=current-unit');expect(state.status,JSON.stringify(state.value)).toBe(200)
   const item=state.data.currentItem
   const answers=index===0?item.scale.definition.items.map((q:any)=>({itemCode:q.itemCode,responseValue:q.options[1].value})):item.answers.map((q:any)=>({formItemId:q.formItemId,value:'Synthetic reflection'}))
   const endpoint=path+(index===0?`/items/${item.id}/scale/submit`:`/form-sections/${item.formSectionId}/submit`)
   const done=await request(product,f.participantUserId,endpoint,{submissionId:randomUUID(),attemptEpoch:state.data.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:state.data.contextSnapshotHash,answers})
   expect(done.status,JSON.stringify(done.value)).toBe(200)
  }
  const child=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:start.data.runtimeBindingRef,scale:{libraryEntryId:approved.entryId}},select:{id:true,attemptEpoch:true,runtimeSnapshotEncrypted:true,frozenAdmissionSnapshotHash:true}})
  expect(child.frozenAdmissionSnapshotHash).toBeNull()
  if(!child.runtimeSnapshotEncrypted)throw new Error('Missing actual frozen library runtime')
  expect((await nativeRuntime.loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted,db)).schemaVersion).toBe(1)
  libraryChildId=child.id
  const parentBefore=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:start.data.runtimeBindingRef},select:{attemptEpoch:true,frozenActiveSlotSetHash:true,contextSnapshotHash:true}})
  concurrentDelivery=true
  const reads=await Promise.all([request(product,f.participantUserId,path+'?view=current-unit'),request(product,f.participantUserId,path+'?view=current-unit')])
  for(const read of reads){
   expect(read.status,JSON.stringify(read.value)).toBe(200)
   expect(read.data).toMatchObject({id:start.data.runtimeBindingRef,status:'IN_PROGRESS',currentIndex:2,currentItem:{type:'SCALE',scaleAssessmentId:child.id}})
  }
  const stored=await db.assessment.findUniqueOrThrow({where:{id:child.id},select:{attemptEpoch:true,runtimeSnapshotEncrypted:true,frozenAdmissionSnapshotHash:true}})
  expect(stored.frozenAdmissionSnapshotHash).toMatch(/^[a-f0-9]{64}$/)
  expect(returnedHashes).toHaveLength(2)
  expect([...new Set(returnedHashes)]).toEqual([stored.frozenAdmissionSnapshotHash])
  expect(stored.runtimeSnapshotEncrypted).toBe(child.runtimeSnapshotEncrypted)
  expect(stored.attemptEpoch).toBe(child.attemptEpoch)
  expect(await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:start.data.runtimeBindingRef},select:{attemptEpoch:true,frozenActiveSlotSetHash:true,contextSnapshotHash:true}})).toEqual(parentBefore)
 },60000)
})
