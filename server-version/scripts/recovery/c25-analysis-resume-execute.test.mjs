/** Preparation-only, pure remaining-driver contracts. Application services,
 * private fixtures and production modules are never imported by these tests. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {sha} from './c25-client.mjs'
import {analysisResumeState} from './c25-analysis-resume-contract.mjs'
import {MIXED_SCALE_CONTRACT,identityHash,assertScaleContract,assertAnalysisDrain} from './c25-analysis-http.mjs'
import {runAnalysisResume,remainingClient,assertFrozenAnalysisBeforeDrain} from './c25-analysis-resume-execute.mjs'
const copy=value=>structuredClone(value),json=value=>JSON.parse(JSON.stringify(value))
const stamp='2026-10-19T00:00:00.000Z',hash='a'.repeat(64)
function example(){
 const actors={teacher:{id:'teacher',role:'TEACHER'},student:{id:'M',role:'STUDENT'},otherTeacher:{id:'other',role:'TEACHER'}}
 const source={actors,resources:{scale:'scale'}},E={teacherId:'teacher',inheritedStudentId:'M',actors:{student:{id:'S',role:'STUDENT'}}}
 const scale={id:'scale',code:'scale-code',creatorId:'teacher',status:'PUBLISHED',instrumentVersion:'2.0.0',instrumentClass:'CUSTOM_DESCRIPTIVE',definition:copy(MIXED_SCALE_CONTRACT),definitionHash:identityHash(MIXED_SCALE_CONTRACT),createdAt:new Date(stamp)}
 const scaleProof=assertScaleContract(scale,{scaleId:'scale',teacherId:'teacher'})
 const fixture={schemaVersion:1,scope:'C25_C19_MINIMAL_ANALYSIS_SUPPLEMENT',courseId:'course',scaleId:'scale',scaleCode:scale.code,scaleProof,actors:{teacher:'teacher',M:'M',S:'S',otherTeacher:'other'},products:{A:{id:'task-A'},B:{id:'task-B'}},cases:{},issued:['start-MA','final-form-MA','final-scale-MA','start-SA','final-form-SA','start-MB','final-scale-MB']}
 const old=Array.from({length:148},(_,index)=>({id:'old-job-'+index,status:'PENDING',createdAt:new Date(stamp)}))
 const spec={MA:{types:['FORM_SECTION','SCALE'],forms:1,scales:1,revision:2},SA:{types:['FORM_SECTION'],forms:1,scales:0,revision:1},MB:{types:['SCALE'],forms:0,scales:1,revision:1}}
 const cases=Object.entries(spec).map(([name,s])=>{
  const c=fixture.cases[name]={actorId:name==='SA'?'S':'M',taskId:name==='MB'?'task-B':'task-A',attemptId:name,attemptEpoch:1,finals:s.types.map(type=>({kind:type}))}
  return {parent:{id:name,userId:c.actorId,compositeAssessmentId:c.taskId,deliveryCourseId:'course',attemptEpoch:1,asyncReportEpoch:1,status:'IN_PROGRESS',createdAt:new Date(stamp),trainingFlowSnapshotEncrypted:'snapshot-'+name,trainingFlowSnapshotHash:hash,trainingFlowPathEncrypted:'path-'+name,trainingFlowPathHash:hash,frozenActiveSlotSetEncrypted:'slots-'+name,frozenActiveSlotSetHash:hash,contextSnapshotHash:null},job:{id:'job-'+name,attemptId:name,attemptEpoch:1,status:'PENDING',attemptCount:0,budgetHeld:true,requestedRevision:s.revision,claimedRevision:0,createdAt:new Date(stamp)},forms:Array.from({length:s.forms},()=>({id:'form-'+name,status:'COMPLETED',attemptEpoch:1,acceptedPayload:'form-original',completedAt:new Date(stamp)})),scales:Array.from({length:s.scales},()=>({id:'scale-'+name,status:'COMPLETED',attemptEpoch:1,acceptedPayload:'scale-original',completedAt:new Date(stamp)})),cognitive:[],sjt:[],checkpoints:[],snapshots:s.types.map(type=>({id:name+'-'+type,compositeAttemptId:name,attemptEpoch:1,unitType:type,terminalState:'COMPLETED',ciphertext:'original-'+type,createdAt:new Date(stamp)}))}
 })
 const before={cases,queue:{id:'reports',pending:3},otherJobs:old},after=copy(before)
 after.queue.pending=0
 for(const row of after.cases){row.parent.status='COMPLETED';row.parent.completedAt=new Date(stamp);row.parent.taskSatisfaction=row.parent.id==='SA'?'NOT_SATISFIED':'SATISFIED';row.job.status='READY';row.job.attemptCount=1;row.job.budgetHeld=false;row.job.claimedRevision=row.job.requestedRevision}
 const exports={batches:Array.from({length:42},(_,index)=>({id:'old-batch-'+index,resourceId:'old-course-'+index,status:'READY',createdAt:new Date(stamp)})),artifacts:Array.from({length:42},(_,index)=>({id:'old-artifact-'+index,batchId:'old-batch-'+index,status:'READY',createdAt:new Date(stamp)}))}
 return {source,E,fixture,scale,before,after,exports,evidence:{source,E,fixture,scalePrewrite:{scale:json(scale),scaleProof},baseline:json({queue:{id:'reports',pending:0},otherJobs:old}),frozen:json(before)}}
}
function setup(options={}){
 const data=example(),calls=[],writes=[];let reads=0,exportReads=0,drained=false,consumed=false,clientCount=0
 const h={state:analysisResumeState,result:{},client(){const number=clientCount++;return {async login(identity,role){calls.push({kind:'login',number,id:identity.id,role})},async request(route,method='GET',...args){calls.push({kind:'http',number,route,method,args});return {mockTransport:true}}}},write(name,value){writes.push({name,value:copy(value)})},check(value){calls.push({kind:'check',value})}}
 const io={async readFacts(){reads++;const value=copy(drained?data.after:data.before);if(options.changeFacts)options.changeFacts(value,reads);return value},async readScale(){const value=copy(data.scale);if(options.changeScale)options.changeScale(value);return value},async readExports(){exportReads++;const value=copy(data.exports);if(consumed){value.batches.push({id:'new-batch',resourceId:'course'});value.artifacts.push({id:'new-artifact',batchId:'new-batch'})}if(options.changeExports)options.changeExports(value,exportReads);return value},reserve(_h,value){calls.push({kind:'reserve',value})},async runChild(_h,kind,input){calls.push({kind:'child',child:kind,input});assert.equal(drained,false);assert.equal(kind,'report');assert.equal(input.attempts.length,3);assert.equal(input.oldJobIds.length,148);drained=true;return {file:'mock-report-proof',sha256:hash}},async verifyDrain(_h,context){assertAnalysisDrain(context);return undefined},async runConsumers(_h,context){
  calls.push({kind:'consumers'});assert.equal(drained,true);assert.equal(context.fixture,data.fixture);assert.equal(context.actors.M.id,'M')
  const {clients}=context,route='/courses/course/training-analysis'
  for(const name of ['MA','SA','MB'])await clients[name==='SA'?'S':'M'].request('/composite-assessments/attempts/'+name)
  await clients.teacher.request(route+'/sources');await clients.teacher.request(route,'POST',{selector:'mock'})
  await clients.otherTeacher.request(route,'POST',{selector:'mock'},404);await clients.M.request(route,'POST',{selector:'mock'},403)
  await clients.teacher.request(route+'/exports','POST',{requestKey:'single-mock-request'})
  for(const suffix of ['/status',''])await clients.teacher.request(route+'/export/artifacts/new-artifact'+suffix)
  for(const suffix of ['/status',''])await clients.otherTeacher.request(route+'/export/artifacts/new-artifact'+suffix,'GET',undefined,404)
  consumed=true
  return {exportEvidence:{batchId:'new-batch',artifactId:'new-artifact'},summary:{mockConsumerIO:true}}
 }}
 return {data,h,io,calls,writes,run:()=>runAnalysisResume(h,data.evidence,io)}
}

test('actual remaining driver accepts frozen facts, calls one drain and consumers, and creates zero attempts or FINALs',async()=>{
 const s=setup();await s.run()
 assert.equal(s.calls.filter(row=>row.kind==='child').length,1);assert.equal(s.calls.filter(row=>row.kind==='consumers').length,1)
 assert.equal(s.calls.filter(row=>row.kind==='login').length,4)
 assert.deepEqual(s.h.result.executed,{attemptsCreatedThisRun:0,finalsSubmittedThisRun:0,coursesCreatedThisRun:0,publicationsCreatedThisRun:0,reportDrainInvocations:1,reportJobsDrainedThisRun:3,exportsEnqueuedThisRun:1})
 assert.equal(s.h.result.inheritedAnalysis.attempts,3);assert.equal(s.h.result.inheritedAnalysis.finals,4);assert.equal(s.h.result.inheritedAnalysis.failedReceiptPassed,false)
 const posts=s.calls.filter(row=>row.kind==='http'&&row.method==='POST')
 assert.deepEqual(posts.map(row=>row.route),['/courses/course/training-analysis','/courses/course/training-analysis','/courses/course/training-analysis','/courses/course/training-analysis/exports'])
 assert.ok(s.calls.filter(row=>row.kind==='http').every(row=>!row.route.includes('/submit')&&!row.route.includes('/questionnaire-products')))
 assert.equal(s.writes.filter(row=>row.name==='c25-analysis-resume-before-drain-private.json').length,1)
})

test('full frozen parent, job, accepted child, snapshot, 148-job and queue drift deny before any report claim',async()=>{
 const changes=[v=>v.cases[0].parent.contextSnapshotHash=hash,v=>v.cases[0].parent.extra='added',v=>v.cases[0].job.attemptCount=1,v=>v.cases[0].job.requestedRevision=1,v=>v.cases[0].forms[0].acceptedPayload='changed',v=>v.cases[0].scales[0].acceptedPayload='changed',v=>v.cases[0].snapshots[0].ciphertext='changed',v=>v.cases[1].checkpoints.push({id:'new'}),v=>v.otherJobs[0].status='READY',v=>v.otherJobs.pop(),v=>v.queue.pending=2,v=>v.cases.pop()]
 for(const change of changes){const s=setup({changeFacts:(value,read)=>{if(read===2)change(value)}});await assert.rejects(s.run());assert.equal(s.calls.filter(row=>row.kind==='child'||row.kind==='consumers').length,0)}
})

test('self-consistent but invalid frozen shapes cannot permit a resumed claim',()=>{
 for(const mutate of [e=>{e.baseline.queue.pending=1;e.frozen.queue.pending=4},e=>e.frozen.cases[0].job.status='READY',e=>e.frozen.cases[0].job.budgetHeld=false,e=>e.frozen.cases[1].scales.push({status:'COMPLETED',attemptEpoch:1}),e=>e.frozen.cases[0].snapshots[0].terminalState='PENDING']){
  const e=example().evidence;mutate(e);assert.throws(()=>assertFrozenAnalysisBeforeDrain({...e,actual:copy(e.frozen)}))
 }
})

test('existing course export, wrong export counts or Scale drift stop before authentication and drain',async()=>{
 const options=[{changeExports:v=>v.batches[0].resourceId='course'},{changeExports:v=>v.batches.pop()},{changeExports:v=>v.artifacts[0].batchId='missing'},{changeScale:v=>v.createdAt=new Date('2026-10-18T00:00:00.000Z')},{changeScale:v=>v.definition.responseSets[0].options[1].score=7}]
 for(const option of options){const s=setup(option);await assert.rejects(s.run());assert.equal(s.calls.filter(row=>['login','child','consumers'].includes(row.kind)).length,0)}
})

test('post-drain mutation rejects consumers instead of concealing accepted snapshot changes',async()=>{
 const s=setup({changeFacts:(value,read)=>{if(read===3)value.cases[0].snapshots[0].ciphertext='mutated'}})
 await assert.rejects(s.run());assert.equal(s.calls.filter(row=>row.kind==='child').length,1);assert.equal(s.calls.filter(row=>row.kind==='consumers').length,0)
})

test('remaining transport rejects creation, FINAL, foreign course, writes and a second export before raw I/O',async()=>{
 const calls=[],data=example(),ledger={exportIssued:false},client=remainingClient({login(){},async request(...args){calls.push(args)}},data.fixture,ledger)
 const denied=[['/courses','POST'],['/courses/join','POST'],['/questionnaire-products','POST'],['/composite-assessments/task-A/attempts','POST'],['/composite-assessments/attempts/MA/items/scale/scale/submit','POST'],['/composite-assessments/attempts/MA/whole/submit','POST'],['/composite-assessments/attempts/other','GET'],['/courses/other/training-analysis','POST'],['/courses/course/training-analysis','DELETE'],['/courses/course/training-analysis/export/artifacts/a/extra','GET']]
 for(const [route,method] of denied)await assert.rejects(client.request(route,method))
 assert.equal(calls.length,0)
 await client.request('/courses/course/training-analysis/exports','POST',{})
 await assert.rejects(client.request('/courses/course/training-analysis/exports','POST',{}))
 assert.equal(calls.length,1)
})


test('drain accepts different ciphertext only with exact decrypted evidence, canonical hash and both ciphertext bindings',()=>{
 const data=example(),before=copy(data.before),after=copy(data.after),baseline={queue:{id:'reports',pending:0},otherJobs:copy(data.before.otherJobs)}
 const pathProofs=before.cases.map((b,index)=>{
  const a=after.cases[index],evidence={attemptId:b.parent.id,attemptEpoch:1,path:{termination:b.parent.id==='SA'?'SCREEN_OUT':'COMPLETE'},accepted:'exact'}
  b.parent.trainingFlowPathHash=identityHash(evidence);a.parent.trainingFlowPathHash=b.parent.trainingFlowPathHash
  a.parent.trainingFlowPathEncrypted='different-random-nonce-'+index
  return {attemptId:b.parent.id,beforeCiphertextSha256:sha(b.parent.trainingFlowPathEncrypted),afterCiphertextSha256:sha(a.parent.trainingFlowPathEncrypted),beforeCanonicalSha256:identityHash(evidence),afterCanonicalSha256:identityHash(evidence),before:copy(evidence),after:copy(evidence)}
 })
 const context={baseline,before,after,fixture:data.fixture,pathProofs}
 assertAnalysisDrain(context)
 assert.throws(()=>assertAnalysisDrain({...context,pathProofs:undefined}))
 for(const mutate of [v=>v.pathProofs[0].after.accepted='changed',v=>{v.pathProofs[0].before.accepted='changed';v.pathProofs[0].after.accepted='changed'},v=>v.pathProofs[0].afterCiphertextSha256=hash,v=>v.pathProofs[0].afterCanonicalSha256=hash,v=>v.after.cases[0].parent.trainingFlowPathHash=hash,v=>v.pathProofs[0].attemptId='foreign',v=>v.pathProofs.pop(),v=>v.after.cases[0].forms[0].acceptedPayload='changed',v=>v.after.cases[0].scales[0].acceptedPayload='changed']){
  const bad=copy(context);mutate(bad);assert.throws(()=>assertAnalysisDrain(bad))
 }
})
