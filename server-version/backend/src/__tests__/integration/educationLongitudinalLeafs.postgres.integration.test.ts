import {randomUUID} from 'node:crypto'
import express from 'express'
import type {Server} from 'node:http'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationLibraryRuntimeFixture} from './educationLibraryRuntimeFixture'
import * as tools from '../../modules/education-tools/private-tool.service'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {publishCognitiveConfig} from '../../modules/cognitive/release.service'
import {readFrozenReport} from '../../modules/cognitive/profile-freeze'
import {createTrialEnvelope} from '../../modules/cognitive/v2/trial-envelope'
import {createSjtDraft,requestSjtReview,reviewSjtDraft} from '../../modules/situational/authoring/service'
import onlineExample from '../../modules/situational/authoring/examples/online-hand-calculated.json'
import {issueAdminContentRoot,revokeAdminContentGrant} from '../../modules/measurement-content/admin-authority.service'
import {educationPublicSourceKey} from '../../modules/education-tools/public-source.identity'
import {listEducationPublicSources} from '../../modules/education-tools/public-source.catalog'
import {addTeacherPrivateCompositionRunTrack,publishTeacherRun} from '../../modules/huiteacher/run.service'
import {addPrivateCompositionRunTrack} from '../../modules/education-tools/private-tool.run-adapter'
import {createTeacherAssessmentRuntimeRouter} from '../../modules/huiteacher/assessmentRuntime.routes'
import {teacherAssessmentRuntimeSource} from '../../modules/huiteacher/assessmentRuntime.source'
import activityRunRouter from '../../modules/campus/activity.run.routes'
import compositeRouter from '../../modules/campus/composite.routes'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
import {SCHOOL_AUTH_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME,HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'

// Actual native services, source U, Run and HTTP FINAL. No attempt, canonical
// result, identity receipt or report is inserted/repaired by this fixture.
vi.hoisted(()=>{process.env.COGNITIVE_MODULE_ENABLED='true'})
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,server:Server,base:string
const proof=()=>({tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:'synthetic-native-strong-session'})
async function request(product:'SCHOOL'|'TEACHER',userId:string,path:string,body?:unknown){
 const user=await db.user.findUniqueOrThrow({where:{id:userId}}),csrf='synthetic-native-csrf'
 const token=generateToken({userId,username:user.username,role:user.role,tokenVersion:user.tokenVersion,accountDomain:'SCHOOL',mfaVerifiedAt:Math.floor(Date.now()/1000),...(product==='TEACHER'?{sessionProduct:'HUITEACHER' as const}:{})})
 const response=await fetch(base+(product==='SCHOOL'?'/campus':'/huiteacher')+path,{headers:{'content-type':'application/json',cookie:`${product==='SCHOOL'?SCHOOL_AUTH_COOKIE_NAME:HUITEACHER_AUTH_COOKIE_NAME}=${token}; ${product==='SCHOOL'?SCHOOL_CSRF_COOKIE_NAME:HUITEACHER_CSRF_COOKIE_NAME}=${csrf}`,[CSRF_HEADER_NAME]:csrf},...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})})
 const value:any=await response.json();return {status:response.status,value,data:value.data}
}
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {readCampusActivity,changeCampusActivityStatus} from '../../modules/campus/activity.service'
import {transitionHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {schoolTrackingOptions,createNextSchoolTrackingActivity,removeSchoolTrackingDraftSource} from '../../modules/campus/personal-tracking'
import {teacherTrackingOptions,createNextTeacherTrackingEvent,removeTeacherTrackingDraftSource} from '../../modules/huiteacher/run.service'
import reportRouter from '../../modules/campus/report.routes'
import teacherRunRouter from '../../modules/huiteacher/run.routes'

async function freezeSource(context:any,kind:'SCALE'|'FORM'|'COMPOSITION',title:string,definition:unknown){
 const draft=await tools.createPrivateTool(context,{kind,title}),saved=await tools.updatePrivateTool(context,draft.id,{expectedRevision:draft.revision,title,definition})
 return tools.freezePrivateTool(context,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
}
async function prepareLongitudinalSource(product:'SCHOOL'|'TEACHER'){
 const preparedFile='/tmp/education-leafs-prepared-'+product+'.json'
 if(process.env.EDUCATION_LEAFS_CONTINUE==='true'&&existsSync(preparedFile)){const prepared=JSON.parse(readFileSync(preparedFile,'utf8'));return {...prepared,fixed:await freezeSource(prepared.context,'COMPOSITION','Longitudinal native mixture',prepared.definition)}}
 const profile='experience',totalTrials=8
  const f=await setupEducationLibraryRuntimeFixture({db,product,trackCount:0,publish:false,...(product==='SCHOOL'?{publisher:'PSYCHOLOGY' as const}:{})})
  const context={entry:product,organizationId:f.organizationId,principal:{userId:f.managerUserId,accountDomain:'SCHOOL' as const}}
  const freeze=(kind:'SCALE'|'FORM'|'COMPOSITION',title:string,definition:unknown)=>freezeSource(context,kind,title,definition)
  const scaleDefinition=compileResearchScale('Synthetic native mixture',{schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'zero',label:'Zero',score:0},{optionKey:'one',label:'One',score:1}],dimensions:[{dimensionKey:'total',label:'Own reflection',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic own reflection',required:true,reverse:false,dimensionKeys:['total']}]})
  scaleDefinition.report.audienceContract={schemaVersion:1,respondent:product==='SCHOOL'?'STUDENT_SELF':'ADULT_SELF',audience:product==='SCHOOL'?'student':'teacher',locale:'zh-CN'}
  scaleDefinition.report.audienceContract.longitudinalMetricKeys=['total']
  const scale=await freeze('SCALE','Independent Scale',scaleDefinition),form=await freeze('FORM','Unscored Form',{schemaVersion:2,pages:[{pageKey:'p',title:'Own comment',questions:[{itemKey:'q',type:'NUMBER',prompt:'Synthetic numeric field, completion only',required:true,options:[],rows:[]}]}]})
  const config=await db.cognitiveTestConfig.create({data:{testType:'reaction',configVersion:'synthetic-native-'+randomUUID(),name:'Native exact reaction',engineVersion:'1.0.0',scoringVersion:'1.0.0',config:{totalTrials:20,foreperiodMinMs:700,foreperiodMaxMs:1500,timeoutMs:2000,readyDurationMs:1000,report:{reportVersion:'1.0.0',referenceMode:'none'}}}})
  const published=await publishCognitiveConfig(config.id,f.libraryAdminUserId),cognitiveMeasurement=await db.measurementContentRelease.findUniqueOrThrow({where:{id:published.measurementReleaseId}})
  const author={userId:f.authorUserId,admin:false},draft=await createSjtDraft(author,{...onlineExample,instrumentKey:'synthetic-education-'+randomUUID(),display:{...onlineExample.display,respondentType:product==='SCHOOL'?'student_self_report':'teacher_self_report'}})
  const reviewed=await requestSjtReview(author,draft.id,draft.revision,draft.contentDigest)
  await reviewSjtDraft({userId:f.libraryAdminUserId,admin:true},reviewed.id,reviewed.revision,reviewed.contentDigest,true,'Synthetic original native publication')
  const sjt=await db.sjtAuthorRelease.findUniqueOrThrow({where:{sourceDraftId:draft.id}}),sjtMeasurement=await db.measurementContentRelease.findUniqueOrThrow({where:{id:sjt.measurementReleaseId!}})
  const nativeSources=[{provider:'COGNITIVE_CONFIG',kind:'COGNITIVE',versionId:config.id,contentHash:cognitiveMeasurement.contentHash,profile},{provider:'SJT_RELEASE',kind:'SJT',versionId:sjt.id,contentHash:sjtMeasurement.contentHash}]
  const sources=[... [scale,form].map(source=>({provider:'PRIVATE_VERSION',kind:source.kind,versionId:source.id,contentHash:source.contentHash})),...nativeSources]
  const definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:product==='SCHOOL'?'STUDENT':'TEACHER',responseMode:'SELF'},instruction:'Synthetic longitudinal leaf mixture',blocks:sources.map(source=>({blockId:randomUUID(),instruction:'',source,...(source.kind!=='FORM'?{longitudinal:true}:{})}))}
  const grant=await issueAdminContentRoot(f.libraryAdminUserId,proof(),{requestId:randomUUID(),expectedVersion:0,reason:'Synthetic exact native education U',grant:{subjectId:f.managerUserId,scope:{product,scopeKind:'ORGANIZATION',scopeId:f.organizationId,resourceKind:'material',resourceKeys:nativeSources.map(source=>educationPublicSourceKey({kind:source.provider as 'COGNITIVE_CONFIG'|'SJT_RELEASE',id:source.versionId,hash:source.contentHash}))},capabilities:['material.use'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
  writeFileSync(preparedFile,JSON.stringify({f,context,definition}))
  const fixed=await freeze('COMPOSITION','Longitudinal native mixture',definition)
  if(!('runtime'in fixed)||!fixed.runtime)throw Error('Native root must have actual sealed runtime')
  return {f,context,fixed,definition}
}
const save=(product:string,state:unknown)=>writeFileSync('/tmp/education-leafs-'+product+'.json',JSON.stringify(state))
suite('Education longitudinal native/composition actual slots',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!);process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='56'.repeat(32);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='57'.repeat(32)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/campus',activityRunRouter,compositeRouter,reportRouter);app.use('/api/huiteacher',teacherRunRouter,createTeacherAssessmentRuntimeRouter(teacherAssessmentRuntimeSource))
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(done=>server.once('listening',done));base='http://127.0.0.1:'+(server.address() as {port:number}).port+'/api'
 })
 afterAll(async()=>{if(server){server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()))}await db?.$disconnect()})
 it.runIf(process.env.EDUCATION_LEAFS_CONTINUE==='true')('refuses removing a published inherited source and keeps the accepted execution intact',async()=>{
  const state=JSON.parse(readFileSync('/tmp/education-leafs-SCHOOL.json','utf8')),wave=state.waves[1],f=state.f
  const before=await db.$queryRaw<Array<{id:string;status:string}>>`SELECT id,status FROM assessment_run_executions WHERE id=${wave.executionId}`
  await expect(removeSchoolTrackingDraftSource({organizationId:f.organizationId,courseId:wave.workflowId,runId:wave.runId,actor:f.manager,trackId:wave.trackId,expectedVersion:1})).rejects.toBeDefined()
  expect(await db.$queryRaw`SELECT id,status FROM assessment_run_executions WHERE id=${wave.executionId}`).toEqual(before)
 })
 it.each(['SCHOOL','TEACHER'] as const)('%s freezes exact independent leaves, changes untracked Form and keeps disclosure scoped',async product=>{
  const path='/tmp/education-leafs-'+product+'.json'
  let state:any
  if(process.env.EDUCATION_LEAFS_CONTINUE==='true'&&existsSync(path))state=JSON.parse(readFileSync(path,'utf8'))
  else{state={...await prepareLongitudinalSource(product),waves:[]};save(product,state)}
  const {f,context,fixed,definition}=state
  const waveCount=product==='SCHOOL'?3:2
  const readVersion=async(runId:string)=>(await db.$queryRaw<Array<{status:string;version:number}>>`SELECT status,version FROM assessment_runs WHERE id=${runId}`)[0]
  const add=async(wave:any,version:any)=>{
   const run=await readVersion(wave.runId),body={expectedVersion:run.version,privateComposition:{versionId:version.id,contentHash:version.contentHash},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]}}
   const track=product==='TEACHER'?await addTeacherPrivateCompositionRunTrack({organizationId:f.organizationId,eventId:wave.workflowId,actorUserId:f.managerUserId},body):await addPrivateCompositionRunTrack({organizationId:f.organizationId,runId:wave.runId,actorUserId:f.managerUserId,parent:{kind:'SCHOOL_ACTIVITY',id:wave.workflowId}},body)
   wave.trackId=track.id;save(product,state)
  }
  for(let ordinal=1;ordinal<=waveCount;ordinal++){
   let wave=state.waves[ordinal-1]
   if(!wave){
    if(ordinal===1)wave={ordinal,runId:f.runId,workflowId:f.workflow.id}
    else{
     const previous=state.waves[ordinal-2],requestId=randomUUID()
     const next=product==='TEACHER'?await createNextTeacherTrackingEvent({organizationId:f.organizationId,eventId:previous.workflowId,actorUserId:f.managerUserId,requestId}):await createNextSchoolTrackingActivity({organizationId:f.organizationId,courseId:previous.workflowId,runId:previous.runId,actor:f.manager,requestId})
     wave={ordinal,runId:next.runId,workflowId:product==='TEACHER'?(next as any).eventId:(next as any).courseId}
    }
    state.waves.push(wave);save(product,state)
   }
   if(ordinal===1&&!wave.trackId)await add(wave,fixed)
   if(ordinal===2&&!wave.replaced){
    if(!state.replacement){
     const formDraft=await tools.createPrivateTool(context,{kind:'FORM',title:'Untracked Form E'}),formSaved=await tools.updatePrivateTool(context,formDraft.id,{expectedRevision:formDraft.revision,title:formDraft.title,definition:{schemaVersion:2,pages:[{pageKey:'p',title:'Untracked new content',questions:[{itemKey:'e',type:'NUMBER',prompt:'Changed untracked numeric field',required:true,options:[],rows:[]}]}]}})
     const form=await tools.freezePrivateTool(context,formDraft.id,{expectedRevision:formSaved.revision,expectedContentHash:formSaved.contentHash})
     const draft=await tools.readPrivateTool(context,fixed.toolId),changed={...definition,blocks:definition.blocks.map((b:any)=>b.source.kind==='FORM'?{...b,source:{provider:'PRIVATE_VERSION',kind:'FORM',versionId:form.id,contentHash:form.contentHash}}:b)}
     const saved=await tools.updatePrivateTool(context,fixed.toolId,{expectedRevision:draft.revision,title:draft.title,definition:changed});state.replacement=await tools.freezePrivateTool(context,fixed.toolId,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash});save(product,state)
    }
    const [oldTrack]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM assessment_run_tracks WHERE run_id=${wave.runId}`
    if(oldTrack){const run=await readVersion(wave.runId);if(product==='TEACHER')await removeTeacherTrackingDraftSource({organizationId:f.organizationId,eventId:wave.workflowId,actorUserId:f.managerUserId,trackId:oldTrack.id,expectedVersion:run.version});else await removeSchoolTrackingDraftSource({organizationId:f.organizationId,courseId:wave.workflowId,runId:wave.runId,actor:f.manager,trackId:oldTrack.id,expectedVersion:run.version})}
    await add(wave,state.replacement);wave.replaced=true;save(product,state)
   }
   const run=await readVersion(wave.runId)
   if(run.status==='DRAFT'){
    const scope=product==='TEACHER'?{organizationId:f.organizationId,eventId:wave.workflowId,actorUserId:f.managerUserId}:{organizationId:f.organizationId,courseId:wave.workflowId,runId:wave.runId,actor:f.manager}
    const options=product==='TEACHER'?await teacherTrackingOptions(scope as any):await schoolTrackingOptions(scope as any)
    expect(new Set(options.choices.map((c:any)=>c.kind))).toEqual(new Set(['SCALE','COGNITIVE','SJT']))
    expect(options.choices.some((c:any)=>c.kind==='FORM')).toBe(false)
    if(product==='SCHOOL'){
     const activity=await readCampusActivity(scope as any)
     if(activity.status==='DRAFT'){const submitted=await changeCampusActivityStatus({...scope,action:'SUBMIT',expectedVersion:activity.version} as any);await changeCampusActivityStatus({...scope,action:'OPEN',expectedVersion:submitted.version} as any)}
    }else await transitionHuiteacherEvent({...scope,action:'OPEN',expectedVersion:1} as any)
    const prefix=product==='TEACHER'?`/organizations/${f.organizationId}/evaluation-events/${wave.workflowId}/run`:`/organizations/${f.organizationId}/activities/${wave.workflowId}/runs/${wave.runId}`
    const tracking={mode:'LONGITUDINAL',metrics:options.choices.map(({trackId,itemId,scoreKey}:any)=>({trackId,itemId,scoreKey})),visibleMetrics:options.choices.filter((c:any)=>c.visible&&!(product==='SCHOOL'&&ordinal===2&&c.kind!=='SCALE')).map(({trackId,itemId,scoreKey}:any)=>({trackId,itemId,scoreKey}))}
    expect((await request(product,f.managerUserId,prefix+'/preview',{expectedVersion:run.version})).status).toBe(200)
    const published=await request(product,f.managerUserId,prefix+'/publish',{expectedVersion:run.version,tracking});expect(published.status,JSON.stringify(published.value)).toBe(200)
   }
   const [execution]=await db.$queryRaw<Array<{id:string;status:string}>>`SELECT e.id,e.status FROM assessment_run_executions e JOIN assessment_run_actor_snapshots respondent ON respondent.id=e.respondent_actor_snapshot_id WHERE e.run_id=${wave.runId} AND respondent.user_id=${f.participantUserId}`
   wave.executionId=execution.id;save(product,state)
   if(execution.status!=='COMPLETED'){
    const start=product==='TEACHER'?`/run-executions/${execution.id}/start-assessment`:`/organizations/${f.organizationId}/activities/${wave.workflowId}/runs/${wave.runId}/executions/${execution.id}/start`
    const started=await request(product,f.participantUserId,start,{});expect(started.status,JSON.stringify(started.value)).toBe(200)
    wave.parentId=started.data.runtimeBindingRef;save(product,state)
    const parentPath=(product==='TEACHER'?'/assessment-composite-attempts/':'/composite-attempts/')+wave.parentId
    for(let index=0;index<4;index++){
     const current=await request(product,f.participantUserId,parentPath+(product==='SCHOOL'?'?view=current-unit':''));expect(current.status,JSON.stringify(current.value)).toBe(200)
     if(current.data.status==='COMPLETED')break
     const item=current.data.currentItem,common={submissionId:randomUUID(),attemptEpoch:current.data.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:current.data.contextSnapshotHash}
     let endpoint:string,payload:unknown
     if(item.type==='SCALE'){endpoint=parentPath+`/items/${item.id}/scale/submit`;payload={...common,answers:item.scale.definition.items.map((q:any)=>({itemCode:q.itemCode,responseValue:ordinal===1?'zero':'one'}))}}
     else if(item.type==='FORM_SECTION'){endpoint=parentPath+`/form-sections/${item.formSectionId}/submit`;payload={...common,answers:item.answers.map((q:any)=>({formItemId:q.formItemId,value:ordinal}))}}
     else if(item.type==='COGNITIVE'){const child=item.cognitiveSession;endpoint=parentPath+`/items/${item.id}/cognitive/${child.sessionId}/submit`;payload={...common,definitionHash:child.definitionHash,trials:Array.from({length:child.config.totalTrials},(_,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*4000,endedAtPerfMs:trialIndex*4000+1300,payload:{foreperiodMs:1000,rtMs:300,prematureCount:0,interrupted:false,inputMode:'pointer'}}))}}
     else{endpoint=parentPath+`/items/${item.id}/situational/${item.situationalAttemptId}/submit`;payload={submissionId:common.submissionId,attemptEpoch:common.attemptEpoch,definitionHash:item.definitionHash,responseProtocol:'sjt-online-response-v1',responses:onlineExample.goldenCases[0].responses}}
     const final=await request(product,f.participantUserId,endpoint,payload);expect(final.status,JSON.stringify(final.value)).toBe(200)
    }
   }
   const single=await request(product,f.participantUserId,`/run-executions/${execution.id}/feedback`);expect(single.status,JSON.stringify(single.value)).toBe(200);expect(single.data.units.some((u:any)=>u.kind==='FORM'&&u.state==='COMPLETION_ONLY')).toBe(true)
   const changed=await request(product,f.participantUserId,product==='TEACHER'?`/run-executions/${execution.id}/changes`:`/reports/student/executions/${execution.id}/changes`,{})
   expect(changed.status,JSON.stringify(changed.value)).toBe(200);wave.changes=changed.data;save(product,state)
   if(ordinal>1){expect(changed.data.status).toBe('AVAILABLE');expect(changed.data.metrics.some((m:any)=>m.points.some((p:any)=>p.value===0))).toBe(true)}
  }
  const report=state.waves.at(-1).changes
  expect(report.metrics.some((m:any)=>m.kind==='FORM')).toBe(false)
  if(product==='SCHOOL')expect(report.metrics.some((m:any)=>m.points.length===3&&m.points[1].missingReason==='NOT_DISCLOSED')).toBe(true)
  const executionId=state.waves.at(-1).executionId,denied=await request(product,f.managerUserId,product==='TEACHER'?`/run-executions/${executionId}/changes`:`/reports/student/executions/${executionId}/changes`,{});expect(denied.status).toBe(404)
 },180000)
})
