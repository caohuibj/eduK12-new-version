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
suite('education ordinary Scale/Form/Cognitive/SJT native SELF on real PostgreSQL',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='56'.repeat(32);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='57'.repeat(32)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/campus',activityRunRouter,compositeRouter);app.use('/api/huiteacher',createTeacherAssessmentRuntimeRouter(teacherAssessmentRuntimeSource))
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code??'ERROR',message:error.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port+'/api'
 })
 afterAll(async()=>{if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}await db?.$disconnect()})
 it.each([['SCHOOL','experience',8],['TEACHER','research',60]] as const)('%s uses actual %s native freezes and four independent FINALs',async(product,profile,totalTrials)=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product,trackCount:0,publish:false,...(product==='SCHOOL'?{publisher:'PSYCHOLOGY' as const}:{})})
  const context={entry:product,organizationId:f.organizationId,principal:{userId:f.managerUserId,accountDomain:'SCHOOL' as const}}
  const freeze=async(kind:'SCALE'|'FORM'|'COMPOSITION',title:string,definition:unknown)=>{
   const draft=await tools.createPrivateTool(context,{kind,title}),saved=await tools.updatePrivateTool(context,draft.id,{expectedRevision:1,title,definition})
   return tools.freezePrivateTool(context,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
  }
  const scaleDefinition=compileResearchScale('Synthetic native mixture',{schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'zero',label:'Zero',score:0},{optionKey:'one',label:'One',score:1}],dimensions:[{dimensionKey:'total',label:'Own reflection',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic own reflection',required:true,reverse:false,dimensionKeys:['total']}]})
  scaleDefinition.report.audienceContract={schemaVersion:1,respondent:product==='SCHOOL'?'STUDENT_SELF':'ADULT_SELF',audience:product==='SCHOOL'?'student':'teacher',locale:'zh-CN'}
  const scale=await freeze('SCALE','Independent Scale',scaleDefinition),form=await freeze('FORM','Unscored Form',{schemaVersion:2,pages:[{pageKey:'p',title:'Own comment',questions:[{itemKey:'q',type:'SHORT_TEXT',prompt:'Synthetic private comment',required:true,options:[],rows:[]}]}]})
  const config=await db.cognitiveTestConfig.create({data:{testType:'reaction',configVersion:'synthetic-native-'+randomUUID(),name:'Native exact reaction',engineVersion:'1.0.0',scoringVersion:'1.0.0',config:{totalTrials:20,foreperiodMinMs:700,foreperiodMaxMs:1500,timeoutMs:2000,readyDurationMs:1000,report:{reportVersion:'1.0.0',referenceMode:'none'}}}})
  const published=await publishCognitiveConfig(config.id,f.libraryAdminUserId),cognitiveMeasurement=await db.measurementContentRelease.findUniqueOrThrow({where:{id:published.measurementReleaseId}})
  const author={userId:f.authorUserId,admin:false},draft=await createSjtDraft(author,{...onlineExample,instrumentKey:'synthetic-education-'+randomUUID(),display:{...onlineExample.display,respondentType:product==='SCHOOL'?'student_self_report':'teacher_self_report'}})
  const reviewed=await requestSjtReview(author,draft.id,draft.revision,draft.contentDigest)
  await reviewSjtDraft({userId:f.libraryAdminUserId,admin:true},reviewed.id,reviewed.revision,reviewed.contentDigest,true,'Synthetic original native publication')
  const sjt=await db.sjtAuthorRelease.findUniqueOrThrow({where:{sourceDraftId:draft.id}}),sjtMeasurement=await db.measurementContentRelease.findUniqueOrThrow({where:{id:sjt.measurementReleaseId!}})
  const nativeSources=[{provider:'COGNITIVE_CONFIG',kind:'COGNITIVE',versionId:config.id,contentHash:cognitiveMeasurement.contentHash,profile},{provider:'SJT_RELEASE',kind:'SJT',versionId:sjt.id,contentHash:sjtMeasurement.contentHash}]
  const sources=[... [scale,form].map(source=>({provider:'PRIVATE_VERSION',kind:source.kind,versionId:source.id,contentHash:source.contentHash})),...nativeSources]
  const definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:product==='SCHOOL'?'STUDENT':'TEACHER',responseMode:'SELF'},instruction:'Four independent original tools',blocks:sources.map(source=>({blockId:randomUUID(),instruction:'',source}))}
  await expect(freeze('COMPOSITION','No native U',definition)).rejects.toMatchObject({code:'PUBLIC_SOURCE_USE_REQUIRED'})
  const grant=await issueAdminContentRoot(f.libraryAdminUserId,proof(),{requestId:randomUUID(),expectedVersion:0,reason:'Synthetic exact native education U',grant:{subjectId:f.managerUserId,scope:{product,scopeKind:'ORGANIZATION',scopeId:f.organizationId,resourceKind:'material',resourceKeys:nativeSources.map(source=>educationPublicSourceKey({kind:source.provider as 'COGNITIVE_CONFIG'|'SJT_RELEASE',id:source.versionId,hash:source.contentHash}))},capabilities:['material.use'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
  const catalog=await listEducationPublicSources(context,{kind:'COGNITIVE'});expect(catalog.list.find(row=>row.sourceId===config.id)).toMatchObject({kind:'COGNITIVE',allowedActions:['REFERENCE_FIXED_VERSION']})
  expect(JSON.stringify(catalog)).not.toMatch(/foreperiodMinMs|choiceScores|reportCaveats|rawTrials|resolvedReportSnapshotEncrypted/)
  const fixed=await freeze('COMPOSITION','Fixed native mixture',definition)
  if(!('runtime'in fixed)||!fixed.runtime)throw Error('Native root must have actual sealed runtime')
  const wrapper=await db.compositeAssessmentItem.findFirstOrThrow({where:{compositeAssessmentId:fixed.runtime.compositeId,type:'COGNITIVE'},include:{cognitiveAssignment:true}})
  expect(wrapper.cognitiveAssignment).toMatchObject({courseId:null,listedStandalone:false,profile,createdBy:f.managerUserId,configId:config.id})
  expect(readFrozenReport(wrapper.cognitiveAssignment!.resolvedReportSnapshotEncrypted)?.profile).toBe(profile)
  await expect(db.cognitiveAssignment.update({where:{id:wrapper.cognitiveAssignmentId!},data:{profile:profile==='research'?'experience':'research'}})).rejects.toThrow()
  const teacher={organizationId:f.organizationId,eventId:f.workflow.id,actorUserId:f.managerUserId},body={expectedVersion:f.expectedVersion,privateComposition:{versionId:fixed.id,contentHash:fixed.contentHash},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]}}
  if(product==='TEACHER')await addTeacherPrivateCompositionRunTrack(teacher,body)
  else await addPrivateCompositionRunTrack({organizationId:f.organizationId,runId:f.runId,actorUserId:f.managerUserId,parent:{kind:'SCHOOL_ACTIVITY',id:f.workflow.id}},body)
  await f.open();if(product==='TEACHER')await publishTeacherRun({...teacher,expectedVersion:f.expectedVersion+1});else await f.publish()
  const [execution]=await f.executions();if(!execution)throw Error('Expected actual participant execution')
  const executionPath=product==='TEACHER'?`/run-executions/${execution.id}`:`/organizations/${f.organizationId}/activities/${f.workflow.id}/runs/${f.runId}/executions/${execution.id}`
  const consent=await request(product,f.participantUserId,executionPath+(product==='TEACHER'?'/assessment-consent/accept':'/consent/accept'),{})
  expect(consent.status,JSON.stringify(consent.value)).toBe(200)
  const started=await request(product,f.participantUserId,executionPath+(product==='TEACHER'?'/start-assessment':'/start'),{})
  expect(started.status,JSON.stringify(started.value)).toBe(200)
  const parentId=started.data.runtimeBindingRef,path=(product==='TEACHER'?'/assessment-composite-attempts/':'/composite-attempts/')+parentId
  await revokeAdminContentGrant(f.libraryAdminUserId,proof(),grant.grantId,{expectedVersion:1,reason:'Synthetic withdrawal after actual admission'})
  expect((await request(product,f.participantUserId,executionPath+(product==='TEACHER'?'/start-assessment':'/start'),{})).data).toMatchObject({runtimeBindingRef:parentId,replayed:true})
  for(const kind of ['SCALE','FORM_SECTION','COGNITIVE','SITUATIONAL']){
   const state=await request(product,f.participantUserId,path+(product==='SCHOOL'?'?view=current-unit':'')),item=state.data.currentItem
   expect(state.status,JSON.stringify(state.value)).toBe(200);expect(item.type).toBe(kind);expect(state.data.totalItems).toBe(4)
   const common={submissionId:randomUUID(),attemptEpoch:state.data.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:state.data.contextSnapshotHash}
   let endpoint:string,payload:unknown
   if(kind==='SCALE'){endpoint=path+`/items/${item.id}/scale/submit`;payload={...common,answers:item.scale.definition.items.map((q:any)=>({itemCode:q.itemCode,responseValue:'zero'}))}}
   else if(kind==='FORM_SECTION'){endpoint=path+`/form-sections/${item.formSectionId}/submit`;payload={...common,answers:item.answers.map((q:any)=>({formItemId:q.formItemId,value:'PRIVATE FORM RESPONSE'}))}}
   else if(kind==='COGNITIVE'){
    const child=item.cognitiveSession;expect(child.profile).toBe(profile);expect(child.config.totalTrials).toBe(totalTrials)
    endpoint=path+`/items/${item.id}/cognitive/${child.id}/submit`
    payload={...common,definitionHash:child.definitionHash,trials:Array.from({length:totalTrials},(_,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*4000,endedAtPerfMs:trialIndex*4000+1300,payload:{foreperiodMs:1000,rtMs:300,prematureCount:0,interrupted:false,inputMode:'pointer'}}))}
   }else{endpoint=path+`/items/${item.id}/situational/${item.situationalAttemptId}/submit`;payload={submissionId:common.submissionId,attemptEpoch:common.attemptEpoch,definitionHash:item.definitionHash,responseProtocol:'sjt-online-response-v1',responses:onlineExample.goldenCases[0].responses}}
   const final=await request(product,f.participantUserId,endpoint,payload);expect(final.status,JSON.stringify(final.value)).toBe(200)
   expect((await request(product,f.participantUserId,endpoint,payload)).status).toBe(200)
  }
  expect((await request(product,f.participantUserId,path+(product==='SCHOOL'?'?view=current-unit':''))).data.status).toBe('COMPLETED')
  const feedback=await request(product,f.participantUserId,`/run-executions/${execution.id}/feedback`)
  expect(feedback.status,JSON.stringify(feedback.value)).toBe(200);expect(feedback.data.units.map((unit:any)=>unit.kind)).toEqual(['SCALE','FORM','COGNITIVE','SJT'])
  expect(feedback.data.units[2]).toMatchObject({state:'READY',nativeCognitiveReport:{method:{profile}}})
  expect(JSON.stringify(feedback.data)).not.toMatch(/PRIVATE FORM RESPONSE|contributions|choiceScores|resolvedConfigSnapshotEncrypted|educationNative|canonicalResult|sourceAttemptId/)
  expect((await request(product,f.managerUserId,`/run-executions/${execution.id}/feedback`)).status).toBe(404)
  await db.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.organizationId,userId:f.participantUserId,permission:'REPORT_READ',reason:'Synthetic independent report deny',deniedByUserId:f.managerUserId}})
  expect((await request(product,f.participantUserId,`/run-executions/${execution.id}/feedback`)).status).toBe(404)
 })
})
