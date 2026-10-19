/** No-service contracts only. These injected rows/clients are deliberately not
 * runtime evidence and never load product code or connect to DB/Redis/HTTP. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {READ_CATEGORIES,COLD_COUNTS} from './c25-c26-contract.mjs'
import {NATIVE_TYPES,PERSISTENCE,c26ExecutionPlan,freezeIndependentReadScope,nativeFinalSpec,readRouteSpecs,assertCheckpointRecovery,assertAcceptedSnapshots,assertOriginalReportDrain,createC26Workload,runC26Workload} from './c25-c26-workload.mjs'

const H='a'.repeat(64),H2='b'.repeat(64),expiry='2026-10-19T16:00:00.000Z',copy=value=>structuredClone(value)
const selector=()=>({schemaVersion:1,courseId:'old-course',mode:'PAIRWISE',waves:['a','b'].map(key=>({waveKey:'wave_'+key,taskId:'old-task-'+key,publication:'2026-10-18T12:00:00.000Z',configDigest:null,variantKey:null,metrics:[{itemId:'old-scale-'+key,metricKey:'total'}]}))})
const independent=teacher=>({route:'/courses/old-course/training-analysis',selector:selector(),teacher,sourceIdentity:{scope:'ACCEPTED_JOINT_RESTORE_C25_AB',sourceSha256:H,rowsSha256:H2,teacherId:'old-teacher'},assertResponse:value=>assert.deepEqual(value,{analysis:'accepted-two-wave-suppression'})})
const persistence=row=>({snapshotHash:row.trainingPersistenceSnapshotHash,attemptId:row.id,attemptEpoch:row.attemptEpoch,courseId:row.deliveryCourseId,checkpoint:copy(PERSISTENCE.checkpoint),localCognitive:copy(PERSISTENCE.localCognitive)})
function fixture({failRoute,changeCheckpointRead=false}={}){
 const requests=[],measures=[],events=[],writes=new Map(),oldJobs=[{id:'old-job',attemptId:'old-attempt',status:'PENDING'}],queue={id:'reports',pending:1},oldBatches=[{id:'old-batch',status:'FAILED'}],oldArtifacts=[{id:'old-artifact',status:'FAILED'}]
 let phaseIndex=0,started=false,parent,checkpoint=null,batch=null,artifact=null,reportCalls=0,exportCalls=0,maxInFlight=0,inFlight=0,sequence=0
 const snapshots=[],children={forms:[],scales:[],cognitive:[],sjt:[]},raw={formAnswers:[],scaleFacts:[],cognitiveRaw:[],situationalRaw:[]},jobs=[]
 const product={id:'new-product',expiresAt:expiry,items:[{id:'form-item',type:'FORM'},{id:'scale-item',type:'SCALE'},{id:'cognitive-item',type:'COGNITIVE'},{id:'sjt-item',type:'SITUATIONAL'}]}
 const units=[{id:'form-section',type:'FORM_SECTION',definitionHash:H,answers:[{formItemId:'form-item',label:'c25 answer'}]},
  {id:'scale-item',type:'SCALE',definitionHash:H,scaleAssessmentId:'scale-child',scale:{definition:{items:[{itemCode:'mixed-scale-item-1',responseSetKey:'default'}],responseSets:[{key:'default',options:[{value:'no'},{value:'yes'}]}]}}},
  {id:'cognitive-item',type:'COGNITIVE',cognitiveSession:{sessionId:'cognitive-child',attemptEpoch:1,definitionHash:H,contextSnapshotHash:null,randomSeed:42,config:{totalTrials:120,nogoRatio:0.2}}},
  {id:'sjt-item',type:'SITUATIONAL',situationalAttemptId:'sjt-child'}]
 const state=()=>({id:'new-attempt',attemptEpoch:1,status:parent.status,currentItem:copy(units[phaseIndex]??null),contextSnapshotHash:null,trainingPersistence:persistence(parent)})
 const loadedSjt={instrument:{online:{responseProtocol:'sjt-online-response-v1'}},attempt:{attemptEpoch:1,definitionHash:H,compiledRuntimeHash:H2,scoringVersion:'1.0.0'}}
 const envelope={schemaVersion:1,snapshotHash:H,definitionHash:H2,drafts:['form','scale','sjt'].map(slotKey=>({slotKey,answers:slotKey==='form'?{'form-item':'yes'}:{}})),cognitiveResults:[]}
 const finals=[
  '/composite-assessments/attempts/new-attempt/form-sections/form-section/submit',
  '/composite-assessments/attempts/new-attempt/items/scale-item/scale/submit',
  '/cognitive/sessions/cognitive-child/submit',
  '/composite-assessments/attempts/new-attempt/items/sjt-item/situational/sjt-child/submit',
 ]
 function commit(spec,index){
  assert.equal(index,phaseIndex);assert.equal(spec.submissionId,'submission-'+(index+1))
  const key=['forms','scales','cognitive','sjt'][index],child=children[key][0]
  child.status='COMPLETED';child.submissionId=spec.submissionId
  snapshots.push({id:'snapshot-'+index,unitType:NATIVE_TYPES[index],slotKey:['form','scale','cognitive','sjt'][index],compositeAttemptId:parent.id,attemptEpoch:1,terminalState:'COMPLETED',sourceAttemptId:child.id,sourceSubmissionId:spec.submissionId,sourceDefinitionHash:H,
   ...(index===0?{collectionFactsEncrypted:'form-cipher'}:{canonicalResultEncrypted:NATIVE_TYPES[index]})})
  if(index===0)raw.formAnswers.push({id:'form-answer',attemptId:parent.id,value:'yes'})
  if(index===1)raw.scaleFacts.push({id:'scale-fact',assessmentId:child.id})
  if(index===2)raw.cognitiveRaw.push({id:'cognitive-raw',sessionId:child.id,trialCount:120})
  if(index===3)raw.situationalRaw.push({id:'sjt-raw',attemptId:child.id})
  if(!jobs.length)jobs.push({id:'new-job',attemptId:parent.id,attemptEpoch:1,wholeSubmissionId:null,attemptCount:0,budgetHeld:true,requestedRevision:0,claimedRevision:0})
  jobs[0].requestedRevision++;jobs[0].status=index===3?'PENDING':'WAITING'
  phaseIndex++
 }
 function client(name='new-client'){
  return {async login(who,role){await this.request('/auth/csrf');await this.request('/auth/training-login','POST',{username:who.username,password:who.password,expectedRole:role})},
   async request(route,method='GET',body,expected=200,rawBytes=false,transportMeta={}){
    requests.push({route,method,body:copy(body),expected,raw:rawBytes,name,transportMeta:copy(transportMeta)});events.push(route);inFlight++;maxInFlight=Math.max(maxInFlight,inFlight)
    try{
     await Promise.resolve()
     if(route===failRoute)throw new Error('Synthetic uncertain transport; no retry')
     if(route.startsWith('/auth/'))return {}
     if(route==='/composite-assessments/new-product/attempts'){
      assert.equal(method,'POST');assert.deepEqual(body,{});assert.equal(started,false);started=true
      parent={id:'new-attempt',attemptEpoch:1,status:'IN_PROGRESS',userId:'new-student',compositeAssessmentId:'new-product',deliveryCourseId:'new-course',contextSnapshotHash:null,asyncReportEpoch:1,trainingPersistenceSnapshotHash:H,trainingPersistenceSnapshot:{policy:copy(PERSISTENCE)},trainingFeedbackSnapshot:{policy:{schemaVersion:1,mode:'IMMEDIATE'}}}
      for(const [key,childId]of [['forms','form-child'],['scales','scale-child'],['cognitive','cognitive-child'],['sjt','sjt-child']])children[key].push({id:childId,status:'IN_PROGRESS',submissionId:null})
      return {attempt:state()}
     }
     if(route==='/composite-assessments/attempts/new-attempt/checkpoint'){
      if(method==='PUT'){
       assert.deepEqual(body,{expectedRevision:0,attemptEpoch:1,envelope});assert.equal(checkpoint,null)
       checkpoint={id:'new-checkpoint',attemptId:parent.id,revision:1,successfulSaveCount:1,payloadEncrypted:'checkpoint-cipher',payloadHash:H,expiresAt:expiry,updatedAt:'2026-10-19T15:00:00.000Z'}
       return {revision:1,successfulSaveCount:1}
      }
      assert.equal(phaseIndex,0,'Checkpoint recovery must occur before every FINAL')
      if(changeCheckpointRead)checkpoint.revision++
      return {revision:checkpoint.revision,successfulSaveCount:1,expiresAt:expiry,envelope:copy(envelope),trainingPersistence:persistence(parent),discardedTerminalSlotKeys:[]}
     }
     if(finals.includes(route)){assert.equal(method,'POST');commit(body,finals.indexOf(route));return {replayed:false}}
     if(route==='/composite-assessments/attempts/new-attempt')return state()
     if(route==='/cognitive/sessions/cognitive-child')return {...(phaseIndex>2?{result:{correct:120}}:{}),trainingPersistence:persistence(parent)}
     if(route==='/composite-assessments/attempts/new-attempt/items/sjt-item/situational/sjt-child')return copy(loadedSjt)
     if(route==='/composite-assessments/attempts/new-attempt/report-status'){assert.equal(reportCalls,1);return {status:'COMPLETED',reportStatus:{state:'READY'},participantFeedback:{state:'AVAILABLE'}}}
     if(route==='/composite-assessments/attempts/new-attempt/report'){assert.equal(reportCalls,1);return {unitReports:NATIVE_TYPES.slice(1).map(type=>({type})),backgroundValues:[{value:'yes'}]}}
     if(route==='/courses/old-course/training-analysis'){
      assert.equal(method,'POST');assert.deepEqual(body,{selector:selector()});assert.equal(exportCalls,1)
      return {analysis:'accepted-two-wave-suppression'}
     }
     if(route==='/composite-assessments/new-product/export'){
      assert.equal(reportCalls,1);assert.equal(method,'POST');assert.deepEqual(body,{detail:'full',format:'csv'});assert.equal(batch,null)
      batch={id:'new-batch',status:'PROCESSING',resourceType:'COMPOSITE',resourceId:'new-product',createdBy:'new-teacher',requestKey:'server-generated-key',requestHash:H,options:{detail:'full'},recordCount:1}
      artifact={id:'new-artifact',batchId:'new-batch',status:'PROCESSING',resourceId:'new-product',format:'csv'}
      return {batchId:batch.id,status:'PROCESSING',replayed:false,artifacts:[{id:artifact.id,format:'csv',downloadUrl:'/api/composite-assessments/new-product/export/artifacts/new-artifact'}]}
     }
     if(route==='/composite-assessments/new-product/export/artifacts/new-artifact'){
      assert.equal(exportCalls,1);assert.equal(rawBytes,true);assert.equal(method,'GET')
      return Buffer.from('A_attempt_id,S002_SCORE_total,C003_total_trials,J004_score\nnew-attempt,1,120,9\n')
     }
     assert.fail('Unexpected route '+route)
    }finally{inFlight--}
   }}
 }
 const prisma={
  compositeAssessmentAttempt:{count:async()=>started?2:1,findUniqueOrThrow:async({where})=>{assert.equal(where.id,'new-attempt');return copy(parent)}},
  compositeAssessment:{findUniqueOrThrow:async({where})=>{assert.equal(where.id,'new-product');return {...product,trainingFeedbackPolicy:{schemaVersion:1,mode:'IMMEDIATE'},trainingPersistencePolicy:copy(PERSISTENCE)}}},
  trainingAttemptCheckpoint:{findUnique:async({where})=>{assert.equal(where.attemptId,'new-attempt');return copy(checkpoint)},findUniqueOrThrow:async({where})=>{assert.equal(where.attemptId,'new-attempt');assert.ok(checkpoint);return copy(checkpoint)}},
  compositeReportQueueBudget:{findUniqueOrThrow:async()=>({...queue,pending:queue.pending+(jobs[0]?.budgetHeld?1:0)})},
  compositeReportJob:{findMany:async({where}={})=>{assert.ok(where===undefined||where.attemptId.notIn[0]==='new-attempt');return copy(oldJobs)}},
  exportBatch:{findMany:async()=>copy([...oldBatches,...(batch?[batch]:[])]),findUniqueOrThrow:async({where})=>{assert.equal(where.id,batch.id);return copy(batch)}},
  exportArtifact:{findMany:async({where}={})=>copy(where?[artifact]:[...oldArtifacts,...(artifact?[artifact]:[])])},
 }
 for(const [model,key]of [['compositeFormAnswer','formAnswers'],['assessmentResultFact','scaleFacts'],['cognitiveRawSubmission','cognitiveRaw'],['situationalRawSubmission','situationalRaw']])prisma[model]={findMany:async()=>copy(raw[key])}
 const api={prisma,children:async()=>copy({...children,snapshots,jobs}),cognitiveFinal:session=>({submissionId:'generator-id',attemptEpoch:session.attemptEpoch,definitionHash:session.definitionHash,contextSnapshotHash:session.contextSnapshotHash,trials:Array.from({length:120},(_,trialIndex)=>({schemaVersion:1,trialIndex,phase:'test',startedAtPerfMs:trialIndex*1500,endedAtPerfMs:trialIndex*1500+800,durationMs:800,flags:{timeout:false,premature:false},qualityEvents:[],payload:{trialType:'go',responded:true,rtMs:300,interrupted:false}}))}),
  loadStoredCanonicalUnitResult:async type=>({resultHash:H,core:{unitType:type,metrics:[{key:{SCALE:'total',COGNITIVE:'correct',SITUATIONAL:'cooperation'}[type],value:{SCALE:1,COGNITIVE:120,SITUATIONAL:9}[type]}]}}),
  parseCsv:bytes=>{const [head,row]=bytes.toString().trim().split('\n'),columns=head.split(',');return {columns,rows:[Object.fromEntries(row.split(',').map((value,index)=>[columns[index],value]))]}}}
 const h={result:{},remaining:()=>100000,check:value=>events.push(value),read:name=>{assert.equal(name,'fixture-private.json');return {}},write:(name,value)=>writes.set(name,copy(value)),client:()=>client()}
 const f={actors:{teacher:{id:'new-teacher',username:'new-teacher',password:'test'},student:{id:'new-student',username:'new-student',password:'test'}},products:{},sjtResponses:[{sceneKey:'sjt_q_first',channelKey:'first',status:'ANSWERED',responseValue:['b','a']}]}
 const options={independentReadScope:independent(client('old-teacher')),runtimeLoader:async()=>api,fixtureLoader:async()=>({
  seed:async supplied=>{supplied.write('c25-fixture-private.json',f);return copy(f)},draftProduct:async(_teacher,_fixture,body)=>{assert.deepEqual(body,{name:'C26 first measured four-tool',four:true});return copy(product)},publish:async(_teacher,value)=>value,checkpointEnvelope:async()=>copy(envelope)}),
  uuid:()=>`submission-${++sequence}`,measure:async(meta,run)=>{measures.push(copy(meta));return run()},
  reportChild:async input=>{
   events.push('REPORT_CHILD');reportCalls++;assert.equal(reportCalls,1);assert.equal(phaseIndex,4)
   assert.deepEqual(input,{attemptId:'new-attempt',attemptEpoch:1,jobId:'new-job',oldJobIds:['old-job']})
   parent.status='COMPLETED';parent.completedAt=expiry;jobs[0].status='READY';jobs[0].attemptCount=1;jobs[0].budgetHeld=false;jobs[0].claimedRevision=4
   checkpoint.payloadEncrypted=null;checkpoint.payloadHash=null;checkpoint.expiresAt=null;checkpoint.revision++;checkpoint.updatedAt=expiry
   return {passed:true,kind:'report'}
  },exportChild:async input=>{events.push('EXPORT_CHILD');exportCalls++;assert.equal(exportCalls,1);assert.deepEqual(input,{batchId:'new-batch',artifactId:'new-artifact',productId:'new-product'});batch.status='READY';artifact.status='READY';return {passed:true,kind:'export'}}}
 return {h,options,requests,measures,events,writes,finals,units,api,getMaxInFlight:()=>maxInFlight,get checkpoint(){return checkpoint},get parent(){return parent}}
}

test('inert module uses built-ins and pure contract only; no executable CLI, services, harness or worker imports',()=>{
 const source=fs.readFileSync(new URL('./c25-c26-workload.mjs',import.meta.url),'utf8')
 assert.deepEqual([...source.matchAll(/^import .* from '([^']+)'/gm)].map(match=>match[1]),['node:assert/strict','node:path','node:crypto','./c25-c26-contract.mjs'])
 assert.doesNotMatch(source,/\bharness\s*\(|import\(['"]\.\/c25-scheduled|exportProcessor|process\.argv|process\.exit/)
 const driverSource=source.slice(source.indexOf('export function createC26Workload'))
 assert.doesNotMatch(driverSource,/prisma\.[A-Za-z]+\.(?:update|create|delete|upsert)|\$executeRaw|fetch\(/)
})
test('finite plan places six successful checkpoint recovery reads before any FINAL and totals exactly 24 + 12',()=>{
 const plan=c26ExecutionPlan(),firstFinal=plan.steps.findIndex(step=>step.step==='native-final-once')
 assert.deepEqual(plan.steps.slice(3,firstFinal).map(step=>step.category),Array(5).fill(READ_CATEGORIES[0]))
 assert.equal(plan.steps.filter(step=>step.step==='serial-read').length,24)
 assert.equal(plan.steps.filter(step=>step.step==='double-read-wave').length,6)
 assert.equal(plan.steps.filter(step=>step.step==='native-final-once').length,4)
 assert.deepEqual(plan.coldCounts,COLD_COUNTS);assert.equal(plan.noAutomaticB,true);assert.equal(Object.isFrozen(plan.steps),true)
})
test('independent selector is frozen, explicit and cannot use one task, wrong teacher route, extra wave or mutable caller data',()=>{
 const value=independent({request(){}}),frozen=freezeIndependentReadScope(value)
 value.selector.waves[0].taskId='changed';value.sourceIdentity.rowsSha256='c'.repeat(64)
 assert.equal(frozen.selector.waves[0].taskId,'old-task-a');assert.equal(frozen.sourceIdentity.rowsSha256,H2)
 for(const change of [x=>x.selector.waves[1].taskId=x.selector.waves[0].taskId,x=>x.selector.waves.push(x.selector.waves[0]),x=>x.route='/courses/other/training-analysis',x=>delete x.assertResponse,x=>x.sourceIdentity={}]){
  const input=independent({request(){}});change(input);assert.throws(()=>freezeIndependentReadScope(input))
 }
})
test('real native route and body builders retain one Form, literal yes Scale and exactly 120 ordered Cognitive trial envelopes',()=>{
 const fake=fixture(),base={id:'new-attempt',attemptEpoch:1,contextSnapshotHash:null}
 const form=nativeFinalSpec({...base,currentItem:fake.units[0]},{submissionId:'one'})
 assert.deepEqual(form,{type:'FORM_SECTION',route:fake.finals[0],method:'POST',body:{submissionId:'one',attemptEpoch:1,definitionHash:H,contextSnapshotHash:null,answers:[{formItemId:'form-item',value:'yes'}]}})
 const scale=nativeFinalSpec({...base,currentItem:fake.units[1]},{submissionId:'two'})
 assert.equal(scale.route,fake.finals[1]);assert.deepEqual(scale.body.answers,[{itemCode:'mixed-scale-item-1',responseValue:'yes',responseTimeMs:17}])
 const cognitive=nativeFinalSpec({...base,currentItem:fake.units[2]},{submissionId:'three',cognitiveFinal:fake.api.cognitiveFinal})
 assert.equal(cognitive.route,fake.finals[2]);assert.equal(cognitive.body.submissionId,'three');assert.equal(cognitive.body.trials.length,120)
 assert.equal(cognitive.body.trials.at(-1).trialIndex,119)
 const responses=[{sceneKey:'sjt_q_first',channelKey:'first',status:'ANSWERED',responseValue:['b','a']}]
 const sjt=nativeFinalSpec({...base,currentItem:fake.units[3]},{submissionId:'four',sjtResponses:responses,loadedSjt:{instrument:{online:{responseProtocol:'sjt-online-response-v1'}},attempt:{attemptEpoch:1,definitionHash:H,compiledRuntimeHash:H2,scoringVersion:'1.0.0'}}})
 assert.deepEqual(sjt,{type:'SITUATIONAL',route:fake.finals[3],method:'POST',body:{submissionId:'four',attemptEpoch:1,definitionHash:H,compiledRuntimeHash:H2,scoringVersion:'1.0.0',responseProtocol:'sjt-online-response-v1',responses}})
 const wrong=copy(fake.units[2]);wrong.cognitiveSession.config.totalTrials=121
 assert.throws(()=>nativeFinalSpec({...base,currentItem:wrong},{cognitiveFinal:fake.api.cognitiveFinal}))
 assert.throws(()=>nativeFinalSpec({...base,currentItem:fake.units[2]},{cognitiveFinal:session=>({...fake.api.cognitiveFinal(session),trials:[]})}))
})
test('route set fixes Cognitive session GET, full report, one analysis POST body and exact new artifact, never status/helper chains',()=>{
 const client={request(){}},analysis=freezeIndependentReadScope(independent(client))
 const specs=readRouteSpecs({attemptId:'new-attempt',sessionId:'cognitive-child',productId:'new-product',artifactId:'new-artifact',student:client,teacher:client,independentReadScope:analysis})
 assert.deepEqual(Object.keys(specs),READ_CATEGORIES)
 assert.equal(specs[READ_CATEGORIES[3]].route,'/cognitive/sessions/cognitive-child');assert.equal(specs[READ_CATEGORIES[3]].method,'GET')
 assert.deepEqual(specs[READ_CATEGORIES[4]].body,{selector:selector()});assert.equal(specs[READ_CATEGORIES[4]].readOnly,true)
 assert.equal(specs[READ_CATEGORIES[5]].route,'/composite-assessments/new-product/export/artifacts/new-artifact');assert.equal(specs[READ_CATEGORIES[5]].raw,true)
})
test('injected complete driver issues 4 FINALs once, no warmup, exact 24 serial + 6 two-request waves and separate setup',async()=>{
 const f=fixture(),result=await runC26Workload(f.h,f.options)
 assert.deepEqual(result.counts,{phase:'A',cold:{...COLD_COUNTS},serialRequests:24,concurrentWaves:6,concurrentRequests:12,maxConcurrency:2,extraFinals:0,automaticRetries:0})
 assert.equal(f.requests.length,52,'Four fake setup login requests, twelve cold HTTP requests, exactly 36 sampled reads')
 assert.equal(f.measures.filter(row=>row.phase==='setup').length,4)
 assert.equal(f.measures.filter(row=>row.phase==='serial').length,24);assert.equal(f.measures.filter(row=>row.phase==='wave').length,6)
 assert.equal(f.measures.filter(row=>row.phase==='cold').length,12)
 for(const route of f.finals)assert.equal(f.requests.filter(row=>row.route===route).length,1)
 const firstFinal=f.events.indexOf(f.finals[0]),checkpoints=f.events.map((route,index)=>[route,index]).filter(([route])=>route==='/composite-assessments/attempts/new-attempt/checkpoint')
 assert.equal(checkpoints.length,7);assert.ok(checkpoints.every(([,index])=>index<firstFinal))
 assert.ok(f.events.indexOf('REPORT_CHILD')>f.events.indexOf(f.finals[3]));assert.ok(f.events.indexOf('EXPORT_CHILD')>f.events.indexOf('REPORT_CHILD'))
 assert.equal(f.getMaxInFlight(),2);assert.equal(result.newCheckpointPayloadCleared,true)
 assert.equal(f.writes.has('c25-fixture-private.json'),false);assert.ok(f.writes.has('c25-c26-fixture-private.json'))
 assert.ok(f.requests.every(row=>!row.route.includes('/whole/')&&!row.route.includes('/history')&&!row.route.includes('/metrics')&&!row.route.includes('old-attempt')))
 assert.equal(f.requests.filter(row=>row.route==='/courses/old-course/training-analysis').length,6)
 for(const row of f.requests.filter(row=>row.route==='/courses/old-course/training-analysis')){assert.equal(row.transportMeta.readOnlyAnalysis,true);assert.match(row.transportMeta.bodySha256,/^[a-f0-9]{64}$/)}
 assert.deepEqual(f.writes.get('c25-c26-workload-result-private.json'),result)
})
test('step order, single-use and uncertain FINAL latch prohibit retry or continuation',async()=>{
 const f=fixture(),driver=createC26Workload(f.h,f.options)
 await assert.rejects(driver.submitFour());assert.equal(f.requests.length,0)
 await driver.prepare();await driver.startAndSaveCheckpoint();await driver.readCheckpoint()
 await assert.rejects(driver.readCheckpoint());await driver.submitFour()
 await assert.rejects(driver.submitFour());assert.equal(f.requests.filter(row=>row.route.endsWith('/submit')).length,4)
 const failed=fixture({failRoute:'/composite-assessments/attempts/new-attempt/form-sections/form-section/submit'}),failedDriver=createC26Workload(failed.h,failed.options)
 await failedDriver.prepare();await failedDriver.startAndSaveCheckpoint();await failedDriver.readCheckpoint()
 await assert.rejects(failedDriver.submitFour(),/uncertain transport/)
 assert.equal(failedDriver.state().stopped,true);const count=failed.requests.length
 await assert.rejects(failedDriver.submitFour());await assert.rejects(failedDriver.drainOriginalReport());assert.equal(failed.requests.length,count)
 assert.equal(failed.requests.filter(row=>row.route===failed.finals[0]).length,1)
})
test('checkpoint mutation and accepted source-submission mismatch fail before more workload',async()=>{
 const f=fixture({changeCheckpointRead:true}),driver=createC26Workload(f.h,f.options)
 await driver.prepare();await driver.startAndSaveCheckpoint();await assert.rejects(driver.readCheckpoint())
 assert.equal(f.requests.filter(row=>row.route.endsWith('/submit')).length,0);assert.equal(driver.state().stopped,true)
 const good=fixture();await runC26Workload(good.h,good.options)
 const saved=good.writes.get('c25-c26-checkpoint-private.json')
 assert.throws(()=>assertCheckpointRecovery({revision:1,successfulSaveCount:1,envelope:saved.envelope,expiresAt:expiry,discardedTerminalSlotKeys:['form'],trainingPersistence:persistence(saved.parent)},saved))
 const before=good.writes.get('c25-c26-before-report-private.json').facts,after=good.writes.get('c25-c26-after-report-private.json').facts,baseline=good.writes.get('c25-c26-workload-baseline-private.json')
 const steps=NATIVE_TYPES.map(type=>good.writes.get(`c25-c26-final-${type.toLowerCase().replaceAll('_','-')}-private.json`))
 assertAcceptedSnapshots(before,steps);assertOriginalReportDrain({baseline,before,after,steps})
 const altered=copy(after);altered.snapshots[0].sourceSubmissionId='other-submission';assert.throws(()=>assertAcceptedSnapshots(altered,steps))
 const retried=copy(after);retried.jobs[0].attemptCount=2;assert.throws(()=>assertOriginalReportDrain({baseline,before,after:retried,steps}))
 const uncleared=copy(after);uncleared.checkpoint.payloadEncrypted='old-payload';assert.throws(()=>assertOriginalReportDrain({baseline,before,after:uncleared,steps}))
})
