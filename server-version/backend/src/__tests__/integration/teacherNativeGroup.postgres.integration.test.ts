import {randomUUID} from 'node:crypto'
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import express from 'express'
import type {Server} from 'node:http'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {independentReviewer} from './independent-reviewer'
import {runtimeDeliverySourceFixture} from '../huiteacher/assessment-runtime.postgres.fixture'
import {createHuiteacherTarget,createHuiteacherEvent,createHuiteacherEventRunDraft,transitionHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {addTeacherRunTrack,publishTeacherRun} from '../../modules/huiteacher/run.service'
import {createTeacherAssessmentRuntimeRouter} from '../../modules/huiteacher/assessmentRuntime.routes'
import {teacherAssessmentRuntimeSource} from '../../modules/huiteacher/assessmentRuntime.source'
import {generateToken} from '../../utils/jwt'
import {csrfProtection} from '../../middleware/csrf'
import {createTrialEnvelope} from '../../modules/cognitive/v2/trial-envelope'
import {descriptiveReportingDefinition} from '../../modules/reporting/content.controller'
import {createPlatformReportingSpec,reviewPlatformReportingSpec,publishPlatformReportingSpec} from '../../modules/reporting/spec'
import {listTeacherNumericGroups,generateTeacherNumericGroup,readTeacherNumericGroup} from '../../modules/huiteacher/numericGroupReport.service'
import {setReportingPayloadMaterializationObserverForTests} from '../../modules/reporting/resultSource'
import {readReportingArtifactRecord} from '../../modules/reporting/artifact'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),file='/tmp/teacher-native-group-leaves/source.json'
const suite=url&&process.env.TEACHER_NATIVE_GROUP_CONTINUATION?describe:describe.skip
let server:Server,base:string
const save=(value:unknown)=>writeFileSync(file,JSON.stringify(value,null,2))
async function request(path:string,userId:string,method='GET',body?:unknown){
 const user=await db.user.findUniqueOrThrow({where:{id:userId}})
 const token=generateToken({userId,username:user.username,role:user.role as any,accountDomain:'SCHOOL',sessionProduct:'HUITEACHER',tokenVersion:user.tokenVersion,mfaVerifiedAt:Date.now()/1000})
 const response=await fetch(base+path,{method,headers:{cookie:'huiteacher_session='+token+'; huiteacher_csrf=native-group',Origin:'http://teacher.localhost','Content-Type':'application/json','X-CSRF-Token':'native-group'},...(body===undefined?{}:{body:JSON.stringify(body)})})
 const json=await response.json() as any
 expect(response.status,JSON.stringify(json)).toBe(200);expect(json.code,JSON.stringify(json)).toBe(0)
 return json.data
}
suite('Teacher native GROUP actual frozen leaves',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!);await db.$connect()
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use('/api/huiteacher',createTeacherAssessmentRuntimeRouter(teacherAssessmentRuntimeSource))
  app.use((e:any,_q:any,r:any,_n:any)=>r.status(e.statusCode??500).json({code:e.code??'ERROR',message:e.message}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base='http://127.0.0.1:'+(server.address() as any).port+'/api/huiteacher'
 })
 afterAll(async()=>{setReportingPayloadMaterializationObserverForTests(null);if(server){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}await db.$disconnect()})
 it('publishes ten new native assignments once and reads Cognitive and SJT aggregates through the existing Teacher consumer',async()=>{
  const old=JSON.parse(readFileSync('/tmp/teacher-self-group-scale/source.json','utf8'))
  const originalCompleted=await db.$queryRaw`SELECT id,runtime_binding_ref,completed_at FROM assessment_run_executions WHERE run_id=${old.runId} AND status='COMPLETED' ORDER BY id`
  let s:any=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{specs:{},artifacts:{}}
  if(!s.delivery){
   const issuer=await db.user.findUniqueOrThrow({where:{id:old.actor.userId}}),review=await independentReviewer(old.actor),reviewer=await db.user.findUniqueOrThrow({where:{id:review.userId}})
   const retained=existsSync('/tmp/teacher-native-group-leaves/source-setup.json')?JSON.parse(readFileSync('/tmp/teacher-native-group-leaves/source-setup.json','utf8')):null
   const delivery=await runtimeDeliverySourceFixture(db,'TEACHER',{id:old.scope.organizationId},issuer,reviewer,'BUNDLE',false,false,{schemaVersion:1,mode:'IMMEDIATE'},false,false,true,retained?.sourceId)
   s.delivery={resourceKey:delivery.resourceKey,entry:delivery.entry,origin:delivery.origin};s.reviewer=review;s.actor=old.actor;save(s)
  }
  if(!s.scope){
   const target=await db.huiteacherEvaluationTarget.findFirst({where:{organizationId:old.scope.organizationId,kind:'ORGANIZATION'}})??await createHuiteacherTarget({...old.scope,kind:'ORGANIZATION',name:'Synthetic native leaf group'}),event=await createHuiteacherEvent({...old.scope,targetId:target.id,kind:'ASSESSMENT',title:'Native Cognitive and SJT GROUP'})
   s.scope={...old.scope,eventId:event.id};save(s)
  }
  if(!s.runId){s.runId=(await createHuiteacherEventRunDraft({...s.scope,name:'Ten new native assignments'})).runId;save(s)}
  if(!s.trackId){
   const memberships=await db.organizationMembership.findMany({where:{organizationId:s.scope.organizationId,userId:{in:old.users}},select:{id:true}}),a=s.delivery.entry.applicability
   const track=await addTeacherRunTrack({...s.scope,expectedRunId:s.runId,expectedVersion:1,resource:{family:'BUNDLE',key:s.delivery.resourceKey,version:'2.0.0'},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:memberships.map(m=>m.id)},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:memberships.map(m=>m.id)},requestedPolicy:{subjectRoles:a.subjectRoles,respondentRoles:a.respondentRoles,relationshipKinds:a.relationshipKinds,perspectives:a.perspectives,analysisMode:a.analysisMode,visibilityPolicyKey:a.visibilityPolicyKey,minimumRespondents:a.minimumRespondents}})
   s.trackId=track.id;save(s)
  }
  const event=await db.huiteacherEvaluationEvent.findUniqueOrThrow({where:{id:s.scope.eventId}})
  if(event.status==='DRAFT')await transitionHuiteacherEvent({...s.scope,action:'OPEN',expectedVersion:event.version})
  const [run]=await db.$queryRaw<Array<{status:string;version:number}>>`SELECT status,version FROM assessment_runs WHERE id=${s.runId}`
  if(run.status==='DRAFT')await publishTeacherRun({...s.scope,expectedVersion:run.version})
  const executions=await db.$queryRaw<Array<{id:string;userId:string;status:string;parent:string|null}>>`SELECT e.id,a.user_id AS "userId",e.status,e.runtime_binding_ref AS parent FROM assessment_run_executions e JOIN assessment_run_actor_snapshots a ON a.id=e.respondent_actor_snapshot_id WHERE e.run_id=${s.runId} ORDER BY e.id`
  expect(executions).toHaveLength(10)
  for(const execution of executions){
   if(execution.status==='COMPLETED')continue
   const started=execution.parent?{runtimeBindingRef:execution.parent}:await request('/run-executions/'+execution.id+'/start-assessment',execution.userId,'POST',{})
   const parent='/assessment-composite-attempts/'+started.runtimeBindingRef
   for(let i=0;i<2;i++){
    const state=await request(parent,execution.userId);if(state.status==='COMPLETED')break
    const item=state.currentItem
    if(item.type==='COGNITIVE'){
     const path=parent+'/items/'+item.id+'/cognitive/'+item.cognitiveSession.sessionId,child=await request(path,execution.userId)
     const trials=Array.from({length:child.config.totalTrials},(_,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*3000,endedAtPerfMs:trialIndex*3000+400+trialIndex*20,payload:{foreperiodMs:700+trialIndex*50,rtMs:400+trialIndex*20,prematureCount:0,interrupted:false,inputMode:'pointer'}}))
     await request(path+'/submit',execution.userId,'POST',{submissionId:randomUUID(),attemptEpoch:child.attemptEpoch??1,definitionHash:child.definitionHash,contextSnapshotHash:child.contextSnapshotHash??null,trials})
    }else{
     expect(item.type).toBe('SITUATIONAL')
     const path=parent+'/items/'+item.id+'/situational/'+item.situationalAttemptId,child=await request(path,execution.userId)
     await request(path+'/submit',execution.userId,'POST',{submissionId:randomUUID(),attemptEpoch:child.attempt.attemptEpoch,definitionHash:child.attempt.definitionHash,compiledRuntimeHash:child.attempt.compiledRuntimeHash,instrumentVersion:child.attempt.instrumentVersion,scoringVersion:child.attempt.scoringVersion,responses:[{sceneKey:'AS-01',channelKey:'behavior',responseValue:'A'},{sceneKey:'AS-02',channelKey:'behavior',responseValue:'B'}]})
    }
   }
   expect((await request(parent,execution.userId)).status).toBe('COMPLETED')
  }
  const index=await listTeacherNumericGroups(s.scope,{configure:true}),choice=index.sources.find(row=>row.trackId===s.trackId)!
  expect(choice).toBeTruthy();expect(choice.canGenerate).toBe(true);expect(choice.tools.map(tool=>tool.leaf.unitType).sort()).toEqual(['COGNITIVE','SITUATIONAL'])
  for(const tool of choice.tools){
   const unit=s.delivery.origin.units.find((unit:any)=>tool.leaf.slotKey.endsWith(':'+unit.itemId)),approved=unit.groupDisclosure.audiences.ORGANIZATION.metricKeys
   expect(tool.metrics.map(metric=>metric.key)).toEqual(approved)
   if(!s.specs[tool.leaf.unitType]){
    // Use the existing platform spec lifecycle; never auto-publish a report spec.
    const definition=descriptiveReportingDefinition({...s.delivery.entry,cohortAnalysisPolicy:{metricKeys:approved},definitionHash:'a'.repeat(64)},'GROUP',10)
    const spec=await createPlatformReportingSpec({actor:s.actor,specKey:'teacher-native-'+tool.leaf.unitType+'-'+randomUUID(),version:1,definition})
    s.specs[tool.leaf.unitType]=spec.id;save(s)
   }
   const [specState]=await db.$queryRaw<Array<{status:string}>>`SELECT status FROM reporting_analysis_specs WHERE id=${s.specs[tool.leaf.unitType]}`
   if(specState.status==='DRAFT')await reviewPlatformReportingSpec({actor:s.reviewer,specId:s.specs[tool.leaf.unitType]})
   if(specState.status!=='PUBLISHED')await publishPlatformReportingSpec({actor:s.actor,specId:s.specs[tool.leaf.unitType]})
   const report=s.artifacts[tool.leaf.unitType]?await readTeacherNumericGroup({...s.scope,artifactId:s.artifacts[tool.leaf.unitType]}):await generateTeacherNumericGroup({...s.scope,trackId:s.trackId,leaf:tool.leaf,specId:s.specs[tool.leaf.unitType],selection:{kind:'ALL'}})
   s.artifacts[tool.leaf.unitType]=report.artifactId;save(s)
   expect(report.projection.completedN).toBe(10);expect(report.projection.metrics).toHaveLength(1)
   expect(report.projection.metrics[0]).toMatchObject({state:'present',validN:10,missingN:0});expect(report.projection.metrics[0].mean).not.toBeNull()
   const stored=await readReportingArtifactRecord(report.artifactId)
   expect(stored.artifactPayload.projection).not.toHaveProperty('metricContributorExecutionIds')
  }
  let materializations=0;setReportingPayloadMaterializationObserverForTests(()=>materializations++)
  expect((await listTeacherNumericGroups(s.scope)).versions).toHaveLength(2)
  for(const artifactId of Object.values(s.artifacts) as string[])await readTeacherNumericGroup({...s.scope,artifactId})
  setReportingPayloadMaterializationObserverForTests(null);expect(materializations).toBe(0)
  expect(await db.$queryRaw`SELECT id,runtime_binding_ref,completed_at FROM assessment_run_executions WHERE run_id=${old.runId} AND status='COMPLETED' ORDER BY id`).toEqual(originalCompleted)
  await expect(readTeacherNumericGroup({...s.scope,actorUserId:old.users[1],artifactId:s.artifacts.COGNITIVE})).rejects.toMatchObject({statusCode:404})
  const completed=await db.$queryRaw<Array<{parent:string}>>`SELECT runtime_binding_ref AS parent FROM assessment_run_executions WHERE run_id=${s.runId} AND status='COMPLETED'`
  expect(completed).toHaveLength(10)
  const canonicalLeaves=await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:{in:completed.map(row=>row.parent)},payloadKind:'UNIT_RESULT',terminalState:'COMPLETED'}})
  expect(canonicalLeaves).toBe(20)
  writeFileSync('/tmp/teacher-native-group-leaves/proof.json',JSON.stringify({passed:true,actualPostgres:true,actualTeacherRuntimeHttp:true,assignments:10,newNativeCanonicalLeaves:canonicalLeaves,completedParentsRetainedAtInvocation:executions.filter(e=>e.status==='COMPLETED').length,oldScaleFinalsUnchanged:true,closedEventRequired:false,leafCeilings:true,snapshotReadMaterializations:materializations,artifacts:s.artifacts,productionAccessed:false},null,2))
 },180000)
})
