import {randomUUID} from 'node:crypto'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {type Server} from 'node:http'
import express from 'express'
import {PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationRuntimeActors} from './educationLibraryRuntimeFixture'
import {createCampusActivity,readCampusActivity,changeCampusActivityStatus} from '../../modules/campus/activity.service'
import {allocateCampusActivityParticipants} from '../../modules/campus/activity.allocation'
import {createCampusActivityRunDraft} from '../../modules/campus/activity.runs'
import {createHuiteacherTarget,createHuiteacherEvent,createHuiteacherEventRunDraft,transitionHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {createNextSchoolTrackingActivity} from '../../modules/campus/personal-tracking'
import {createNextTeacherTrackingEvent} from '../../modules/huiteacher/run.service'
import {addAssessmentRunTrackDraft} from '../../modules/assessment-run/repository'
import {publishComposite} from '../../modules/composite/composite.service'
import {publishCognitiveConfig} from '../../modules/cognitive/release.service'
import {publishAssignmentMeasurementRelease} from '../../modules/cognitive/assignment-measurement-release'
import {freezeAssignmentProfile,freezeDataForWrite} from '../../modules/cognitive/profile-freeze'
import {requireCognitiveRegistryEntry} from '../../modules/cognitive/cognitive.registry'
import {createTrialEnvelope} from '../../modules/cognitive/v2/trial-envelope'
import {createBundleProductService} from '../../modules/bundle-product/service'
import {BundleDefinitionProvider} from '../../modules/bundle-product/definition-provider'
import {readInstance} from '../../modules/bundle-product/instance'
import {cognitiveSelfBundle} from '../assessment-bundle/fixtures'
import {MIXED_SCALE_DEFINITION} from '../questionnaire/product-fixtures'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {publishRegisteredScaleFixture} from './registered-resource-fixture'
import {issueAdminContentRoot} from '../../modules/measurement-content/admin-authority.service'
import {getContentRelease,publishContentRelease} from '../../modules/measurement-content/repository'
import {DECLARATIVE_REPORT_GENERATOR} from '../../modules/measurement-content/report-renderer'
import * as producer from '../../modules/education-tools/assessment-resource.service'
import {resultAudiences} from '../../modules/assessment-policy/result-disclosure'
import activityRouter from '../../modules/campus/activity.run.routes'
import compositeRouter from '../../modules/campus/composite.routes'
import reportRouter from '../../modules/campus/report.routes'
import teacherRunRouter from '../../modules/huiteacher/run.routes'
import {createTeacherAssessmentRuntimeRouter} from '../../modules/huiteacher/assessmentRuntime.routes'
import {teacherAssessmentRuntimeSource} from '../../modules/huiteacher/assessmentRuntime.source'
import {educationSchoolAssessmentReportRouter,educationTeacherAssessmentReportRouter} from '../../modules/reporting/education-assessment-report.routes'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
import {SCHOOL_AUTH_COOKIE_NAME,SCHOOL_CSRF_COOKIE_NAME,HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../../utils/authCookies'
vi.hoisted(()=>{process.env.COGNITIVE_MODULE_ENABLED='true';process.env.BUNDLE_PRODUCTS_ENABLED='true'})
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,server:Server,base:string
const file=(product:string)=>'/tmp/education-native-longitudinal-'+product+'.json'
const save=(s:any)=>writeFileSync(file(s.product),JSON.stringify(s),{mode:0o600})
const proof=()=>({tokenVersion:0,adminSessionId:'synthetic-native-longitudinal',adminVerifiedAt:Math.floor(Date.now()/1000)})
async function context(state:any,id:string){const u=await db.user.findUniqueOrThrow({where:{id}});return {product:state.product,organizationId:state.actors.organizationId,principal:{userId:id,username:u.username,role:u.role,accountDomain:u.accountDomain,platformRole:u.platformRole,tokenVersion:0,mustChangePassword:false,...proof()}}}
async function request(s:any,userId:string,path:string,body?:unknown){
 const u=await db.user.findUniqueOrThrow({where:{id:userId}}),teacher=s.product==='TEACHER',csrf='synthetic-native-longitudinal'
 const token=generateToken({userId,username:u.username,role:u.role,accountDomain:'SCHOOL',tokenVersion:0,mfaVerifiedAt:Math.floor(Date.now()/1000),...(teacher?{sessionProduct:'HUITEACHER' as const}:{})})
 const response=await fetch(base+(teacher?'/huiteacher':'/campus')+path,{headers:{'content-type':'application/json',cookie:`${teacher?HUITEACHER_AUTH_COOKIE_NAME:SCHOOL_AUTH_COOKIE_NAME}=${token}; ${teacher?HUITEACHER_CSRF_COOKIE_NAME:SCHOOL_CSRF_COOKIE_NAME}=${csrf}`,[CSRF_HEADER_NAME]:csrf},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})})
 const result:any=await response.json();expect(response.status,JSON.stringify(result)).toBe(200);return result.data
}
async function grant(s:any,ids:string[]){
 const root=await issueAdminContentRoot(s.systemId,proof(),{requestId:randomUUID(),expectedVersion:0,reason:'Isolated exact native source and own C/R distribution',grant:{subjectId:s.systemId,scope:{product:s.product,scopeKind:'ORGANIZATION',scopeId:s.actors.organizationId,resourceKind:'material',resourceKeys:ids},capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
 return ids.map(resourceId=>({resourceId,grantId:root.grantId}))
}
async function makeSource(s:any){
 if(s.sourceId&&(await db.compositeAssessment.findUniqueOrThrow({where:{id:s.sourceId}})).status==='PUBLISHED')return
 if(s.product==='SCHOOL'){
  if(!s.courseId){s.courseId=(await db.course.create({data:{creatorId:s.systemId,title:'Standalone source course',courseType:'TRAINING_COURSE',courseCode:randomUUID(),status:'PUBLISHED'}})).id;save(s)}
  if(!s.configId){s.configId=(await db.cognitiveTestConfig.create({data:{testType:'reaction',configVersion:'native-longitudinal-'+randomUUID(),name:'Synthetic standalone reaction',engineVersion:'1.0.0',scoringVersion:'1.0.0',accessPolicy:'OPEN',config:{totalTrials:20,foreperiodMinMs:700,foreperiodMaxMs:1500,timeoutMs:2000,readyDurationMs:1000,report:{reportVersion:'1.0.0',referenceMode:'none'}}}})).id;save(s);await publishCognitiveConfig(s.configId,s.systemId)}
  if(!s.assignmentId){const config=await db.cognitiveTestConfig.findUniqueOrThrow({where:{id:s.configId}}),freeze=freezeAssignmentProfile({entry:requireCognitiveRegistryEntry('reaction','1.0.0','1.0.0'),profile:'experience',baseConfig:config.config as any});s.assignmentId=(await db.cognitiveAssignment.create({data:{configId:config.id,createdBy:s.systemId,courseId:s.courseId,title:'Exact experience profile',status:'PUBLISHED',listedStandalone:true,...freezeDataForWrite(freeze)}})).id;save(s);await db.$transaction(tx=>publishAssignmentMeasurementRelease(tx,s.systemId,s.assignmentId))}
  if(!s.sourceId){s.sourceId=(await db.compositeAssessment.create({data:{code:'native-source-'+randomUUID(),name:'Standalone native source',createdBy:s.systemId,courseId:s.courseId,items:{create:{type:'COGNITIVE',position:0,required:true,cognitiveAssignmentId:s.assignmentId}}}})).id;save(s)}
  if(!(await db.cognitiveAssignment.findUniqueOrThrow({where:{id:s.assignmentId}})).listedStandalone)await db.cognitiveAssignment.update({where:{id:s.assignmentId},data:{listedStandalone:true}})
  if((await db.cognitiveAssignment.findUniqueOrThrow({where:{id:s.assignmentId}})).courseId!==s.courseId)await db.cognitiveAssignment.update({where:{id:s.assignmentId},data:{courseId:s.courseId}})
  if((await db.compositeAssessment.findUniqueOrThrow({where:{id:s.sourceId}})).courseId!==s.courseId)await db.compositeAssessment.update({where:{id:s.sourceId},data:{courseId:s.courseId}})
  await publishComposite(s.systemId,'ADMIN',s.sourceId)
 }else{
  if(!s.scaleId){const definition=structuredClone(MIXED_SCALE_DEFINITION);definition.report.audienceContract={schemaVersion:1,respondent:'ADULT_SELF',audience:'teacher',locale:'zh-CN',longitudinalMetricKeys:['total']};s.scaleId=(await db.scale.create({data:{code:'native_fixed_'+randomUUID().replace(/-/g,''),name:'Synthetic own fixed leaf',creatorId:s.systemId,status:'PUBLISHED',instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:'2.0.0',definition,definitionHash:hashScaleDefinition(definition)}})).id;save(s);await publishRegisteredScaleFixture(db,s.scaleId)}
  if(!s.bundleEntry){const scale=await db.scale.findUniqueOrThrow({where:{id:s.scaleId}});s.bundleEntry={definition:cognitiveSelfBundle({bundleKey:'synthetic_fixed_'+randomUUID().replace(/-/g,''),status:'PUBLISHED',category:'scale_self',population:{subjectPopulation:'adult'},slots:['first','second'].map((slotKey,position)=>({slotKey,position,unitType:'SCALE',required:true,instrumentKey:scale.code,instrumentVersion:'2.0.0',respondentType:'SELF',valueSelectors:['total']})),engine:{key:'scale-evidence-v1',version:'1.0.0'},reportDefinitionKey:'scale-evidence-report-v1'}),contextDefinition:null,ruleSet:null,reportDefinition:{key:'scale-evidence-report-v1',version:'1.0.0',title:'Synthetic fixed evidence',sections:{summary:'Raw values',quality:'Quality',evidence:'Leaf evidence',limitations:'Descriptive only'}}};save(s)}
  if(!s.sourceId&&s.bundleEntry.definition.category==='scale'){s.bundleEntry.definition.category='scale_self';save(s)}
  const product=createBundleProductService(new BundleDefinitionProvider([s.bundleEntry])),actor={userId:s.systemId,role:'ADMIN' as const}
  if(!s.courseId){s.courseId=(await db.course.create({data:{creatorId:s.systemId,title:'Synthetic source course',courseType:'TRAINING_COURSE',courseCode:randomUUID(),status:'PUBLISHED'}})).id;save(s)}
  if(!s.sourceId){const draft=await product.create(actor,{requestId:randomUUID(),bundleKey:s.bundleEntry.definition.bundleKey,bundleVersion:'1.0.0',name:'Two required frozen leaves',courseId:s.courseId,bindings:['first','second'].map(slotKey=>({slotKey,resourceId:s.scaleId}))});s.sourceId=draft.id;save(s)}
  const row=await product.detail(actor,s.sourceId);await product.publish(actor,s.sourceId,row.revision)
 }
 save(s)
}
async function register(s:any){
 if(s.resourceKey)return
 const issuer=await context(s,s.systemId),reviewer=await context(s,s.reviewerId)
 if(!s.prepared){const source=await db.compositeAssessment.findUniqueOrThrow({where:{id:s.sourceId}}),units=(source.trainingContentSnapshot as any).units;s.licenses=await grant(s,[...new Set<string>([s.sourceId,...units.map((u:any)=>u.measurement.releaseId)])]);s.prepared=await producer.prepareEducationAssessment(issuer,{resourceId:randomUUID(),sourceCompositeId:s.sourceId,title:'Exact native longitudinal delivery',family:s.product==='SCHOOL'?'COGNITIVE':'BUNDLE',licenses:s.licenses});save(s)}
 if(!s.reports)s.reports=[]
 for(const unit of s.prepared.units){if(s.reports.some((r:any)=>r.itemId===unit.itemId))continue
  const c=await db.$transaction(tx=>getContentRelease(tx,unit.measurement.releaseId));if(!c||c.layer!=='MEASUREMENT')throw Error('Exact C required')
  const metricKeys=c.content.metrics.map(m=>m.metricKey),r=await db.$transaction(tx=>publishContentRelease(tx,{layer:'REPORT',family:unit.family,key:'native_longitudinal_'+randomUUID(),version:'1.0.0',scope:{kind:'PRIVATE',product:s.product,ownerId:s.systemId,resourceId:s.prepared.runtimeCompositeId},sourceReleaseId:null,provenance:{synthetic:true},assetRefs:[],content:{projectionVersion:1,measurements:[{releaseId:unit.measurement.releaseId,contentHash:unit.measurement.contentHash}],metricKeys,audience:s.product==='SCHOOL'?'student':'teacher',language:'zh-CN',generatorVersion:DECLARATIVE_REPORT_GENERATOR,template:{title:'Original numeric leaf',blocks:metricKeys.map(metricKey=>({type:'METRIC' as const,metricKey,display:'RAW' as const}))}}},s.systemId))
  s.licenses.push(...await grant(s,[r.releaseId]));s.reports.push({itemId:unit.itemId,releaseId:r.releaseId,metricKeys});save(s)
 }
 const keys=[...new Set<string>(s.reports.flatMap((r:any)=>r.metricKeys))],none={mode:'NONE',metricKeys:[],longitudinalMetricKeys:[]},disclosure={schemaVersion:1,policyKey:'native-own:'+s.prepared.resourceId,minimumRespondents:null,audiences:Object.fromEntries(resultAudiences.map(a=>[a,a==='RESPONDENT'?{mode:'INDIVIDUAL_SUMMARY',metricKeys:keys,longitudinalMetricKeys:keys}:none]))}
 if(!s.registered){s.registered=await producer.registerEducationAssessment(issuer,s.prepared.resourceId,{expectedPreparationHash:s.prepared.preparationHash,disclosure,feedbackPolicy:{schemaVersion:1,mode:'IMMEDIATE'},references:{schemaVersion:1,units:[]},reports:s.reports.map(({itemId,releaseId}:any)=>({itemId,releaseId})),licenses:s.licenses});save(s)}
 const current=await producer.readEducationAssessmentRegistration(issuer,s.prepared.resourceId)
 if(current.status==='DRAFT')await producer.transitionEducationAssessment(reviewer,s.prepared.resourceId,'REVIEW',{expectedEntryHash:s.registered.entryHash,reason:'Independent synthetic numeric delivery review'})
 const published=await producer.transitionEducationAssessment(reviewer,s.prepared.resourceId,'PUBLISH',{expectedEntryHash:s.registered.entryHash,reason:'Synthetic own numeric delivery only'})
 s.resourceKey=published.resourceKey;s.resourceVersion=published.version;save(s)
}
async function firstWave(s:any){
 const a=s.actors
 if(s.product==='SCHOOL'){
  const activity=await createCampusActivity({actor:a.manager,organizationId:a.organizationId,title:'Native own changes',purpose:'STUDENT_WELLBEING'}),scope={actor:a.manager,organizationId:a.organizationId,courseId:activity.id}
  await allocateCampusActivityParticipants({...scope,classUnitIds:[a.classUnitId],requestKey:randomUUID(),expectedVersion:1})
  return {ordinal:1,workflowId:activity.id,runId:(await createCampusActivityRunDraft({...scope,name:'Standalone exact native'})).id}
 }
 const key={organizationId:a.organizationId,actorUserId:a.manager.userId},target=await createHuiteacherTarget({...key,kind:'ORGANIZATION',name:'Synthetic own teachers'}),event=await createHuiteacherEvent({...key,targetId:target.id,kind:'ASSESSMENT',title:'Fixed native changes'})
 return {ordinal:1,workflowId:event.id,runId:(await createHuiteacherEventRunDraft({...key,eventId:event.id,name:'Fixed native exact'})).runId}
}
suite('registered native longitudinal actual two-wave lifecycle',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='56'.repeat(32);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='57'.repeat(32);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect();const app=express();app.use(express.json());app.use('/api',csrfProtection);app.use('/api/campus',activityRouter,compositeRouter,reportRouter,educationSchoolAssessmentReportRouter);app.use('/api/huiteacher',teacherRunRouter,createTeacherAssessmentRuntimeRouter(teacherAssessmentRuntimeSource),educationTeacherAssessmentReportRouter);app.use((e:any,_q:any,r:any,_n:any)=>r.status(e.statusCode??500).json({code:e.code??'ERROR',message:e.message}));server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base='http://127.0.0.1:'+(server.address() as any).port+'/api'})
 afterAll(async()=>{if(server){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}await db?.$disconnect()})
 it.each(['SCHOOL','TEACHER'] as const)('%s preserves the registered exact source through two native publications and both reports',async product=>{
  let s:any
  if(process.env.EDUCATION_NATIVE_CONTINUE==='true'&&existsSync(file(product)))s=JSON.parse(readFileSync(file(product),'utf8'))
  else{const actors=await setupEducationRuntimeActors(db,product),admin=async()=>db.user.create({data:{username:'native_issuer_'+randomUUID(),passwordHash:'synthetic-only',role:'ADMIN',accountDomain:'TRAINING',platformRole:'SYSTEM_ADMIN'}});s={product,actors,systemId:(await admin()).id,reviewerId:(await admin()).id,waves:[]};save(s)}
  await makeSource(s);await register(s)
  for(let ordinal=1;ordinal<=2;ordinal++){
   const a=s.actors,key={organizationId:a.organizationId,actorUserId:a.manager.userId};let wave=s.waves[ordinal-1]
   if(!wave){if(ordinal===1)wave=await firstWave(s);else{const previous=s.waves[0],next=product==='SCHOOL'?await createNextSchoolTrackingActivity({organizationId:a.organizationId,courseId:previous.workflowId,runId:previous.runId,actor:a.manager,requestId:randomUUID()}):await createNextTeacherTrackingEvent({...key,eventId:previous.workflowId,requestId:randomUUID()});wave={ordinal,runId:next.runId,workflowId:product==='SCHOOL'?(next as any).courseId:(next as any).eventId}}s.waves.push(wave);save(s)}
   const prefix=product==='SCHOOL'?`/organizations/${a.organizationId}/activities/${wave.workflowId}/runs/${wave.runId}`:`/organizations/${a.organizationId}/evaluation-events/${wave.workflowId}/run`
   let [run]=await db.$queryRaw<Array<{status:string;version:number}>>`SELECT status,version FROM assessment_runs WHERE id=${wave.runId}`
   if(ordinal===1&&!wave.trackId){const e=s.registered.entry.applicability,track=await addAssessmentRunTrackDraft({...key,runId:wave.runId,expectedVersion:run.version,expectedRunId:wave.runId,educationWorkflow:{product,id:wave.workflowId},resource:{family:product==='SCHOOL'?'COGNITIVE':'BUNDLE',key:s.resourceKey,version:s.resourceVersion},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[a.participantMembershipId]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[a.participantMembershipId]},requestedPolicy:{subjectRoles:e.subjectRoles,respondentRoles:e.respondentRoles,relationshipKinds:e.relationshipKinds,perspectives:e.perspectives,analysisMode:e.analysisMode,visibilityPolicyKey:e.visibilityPolicyKey,minimumRespondents:e.minimumRespondents}});wave.trackId=track.id;save(s)}
   ;[run]=await db.$queryRaw`SELECT status,version FROM assessment_runs WHERE id=${wave.runId}`
   if(run.status==='DRAFT'){
    const options=await request(s,a.manager.userId,prefix+'/tracking'),chosen=options.choices[0];expect(chosen.visible).toBe(true)
    if(product==='SCHOOL'){const scope={actor:a.manager,organizationId:a.organizationId,courseId:wave.workflowId},activity=await readCampusActivity(scope);if(activity.status==='DRAFT'){const submitted=await changeCampusActivityStatus({...scope,action:'SUBMIT',expectedVersion:activity.version});await changeCampusActivityStatus({...scope,action:'OPEN',expectedVersion:submitted.version})}}
    else await transitionHuiteacherEvent({...key,eventId:wave.workflowId,action:'OPEN',expectedVersion:1})
    await request(s,a.manager.userId,prefix+'/preview',{expectedVersion:run.version});await request(s,a.manager.userId,prefix+'/publish',{expectedVersion:run.version,tracking:{mode:'LONGITUDINAL',metrics:[{trackId:chosen.trackId,itemId:chosen.itemId,scoreKey:chosen.scoreKey}],visibleMetrics:[{trackId:chosen.trackId,itemId:chosen.itemId,scoreKey:chosen.scoreKey}]}})
   }
   const [execution]=await db.$queryRaw<Array<{id:string;status:string}>>`SELECT e.id,e.status FROM assessment_run_executions e JOIN assessment_run_actor_snapshots respondent ON respondent.id=e.respondent_actor_snapshot_id WHERE e.run_id=${wave.runId} AND respondent.user_id=${a.participantUserId}`
   wave.executionId=execution.id;save(s)
   if(execution.status!=='COMPLETED'){
    const start=await request(s,a.participantUserId,product==='SCHOOL'?prefix+'/executions/'+execution.id+'/start':'/run-executions/'+execution.id+'/start-assessment',{});wave.parentId=start.runtimeBindingRef;save(s)
    const parent=(product==='SCHOOL'?'/composite-attempts/':'/assessment-composite-attempts/')+wave.parentId
    for(let count=0;count<2;count++){
     const current=await request(s,a.participantUserId,parent+(product==='SCHOOL'?'?view=current-unit':''));if(current.status==='COMPLETED')break
     const item=current.currentItem,common={submissionId:randomUUID(),attemptEpoch:current.attemptEpoch,definitionHash:item.definitionHash,contextSnapshotHash:current.contextSnapshotHash}
     if(item.type==='SCALE')await request(s,a.participantUserId,parent+'/items/'+item.id+'/scale/submit',{...common,answers:item.scale.definition.items.map((q:any)=>({itemCode:q.itemCode,responseValue:ordinal===1?'no':'yes'}))})
     else{const child=item.cognitiveSession;await request(s,a.participantUserId,parent+'/items/'+item.id+'/cognitive/'+child.sessionId+'/submit',{...common,definitionHash:child.definitionHash,trials:Array.from({length:child.config.totalTrials},(_,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*4000,endedAtPerfMs:trialIndex*4000+1300,payload:{foreperiodMs:1000,rtMs:300,prematureCount:0,interrupted:false,inputMode:'pointer'}}))})}
    }
   }
   const refreshed=await request(s,a.participantUserId,(product==='SCHOOL'?'/composite-attempts/':'/assessment-composite-attempts/')+wave.parentId+(product==='SCHOOL'?'?view=current-unit':''));expect(refreshed.status).toBe('COMPLETED')
   const single=await request(s,a.participantUserId,'/assessment-reports/executions/'+execution.id);wave.single=single;save(s);expect(single.state,JSON.stringify(single)).toBe('READY')
   const changed=await request(s,a.participantUserId,product==='SCHOOL'?'/reports/student/executions/'+execution.id+'/changes':'/run-executions/'+execution.id+'/changes',{});wave.changes=changed;save(s)
   if(ordinal===2){expect(changed.status).toBe('AVAILABLE');expect(changed.metrics).toHaveLength(1);expect(changed.metrics[0].points.map((p:any)=>p.value)).toEqual(product==='SCHOOL'?[300,300]:[0,1])}
  }
  expect(new Set(s.waves.map((w:any)=>w.parentId)).size).toBe(2)
  if(product==='TEACHER'){const runtime=await db.compositeAssessment.findUniqueOrThrow({where:{id:s.prepared.runtimeCompositeId},include:{bundleInstance:true,items:true}}),original=await db.compositeAssessment.findUniqueOrThrow({where:{id:s.sourceId},include:{bundleInstance:true}});expect(runtime.items).toHaveLength(2);expect(runtime.items.every(i=>i.required)).toBe(true);expect(readInstance(runtime.bundleInstance!).frozen.contentHash).toBe(readInstance(original.bundleInstance!).frozen.contentHash);for(const wave of s.waves){const [track]=await db.$queryRaw<Array<{resourceKey:string}>>`SELECT resource_key AS "resourceKey" FROM assessment_run_tracks WHERE run_id=${wave.runId}`;expect(track.resourceKey).toBe(s.resourceKey)}}
 },180000)
})
