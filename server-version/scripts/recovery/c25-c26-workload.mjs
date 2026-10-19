/** C26 preparation only. Importing this module opens no database, queue, worker,
 * service or transport. The coordinator supplies the raw no-/metrics harness,
 * bounded child runners, observation windows and accepted independent A/B scope.
 * This is the first measured new chain, not a claim of OS/process/PG coldness. */
import assert from 'node:assert/strict'
import path from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {READ_CATEGORIES,COLD_COUNTS,assertWorkloadCounts} from './c25-c26-contract.mjs'

export const NATIVE_TYPES=Object.freeze(['FORM_SECTION','SCALE','COGNITIVE','SITUATIONAL'])
export const PERSISTENCE=Object.freeze({schemaVersion:1,checkpoint:Object.freeze({enabled:true,ttlHours:1}),localCognitive:Object.freeze({enabled:true,ttlHours:1})})
const prefix='/composite-assessments'
const hash=value=>createHash('sha256').update(value).digest('hex')
const clone=value=>structuredClone(value)
const json=value=>JSON.stringify(value,(_key,v)=>typeof v==='bigint'?v.toString():v)
const id=value=>{assert.equal(typeof value,'string');assert.match(value,/^[A-Za-z0-9_-]+$/);return value}
const sha=value=>{assert.match(value,/^[a-f0-9]{64}$/);return value}
const frozen=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))frozen(child);Object.freeze(value)}return value}
const sorted=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id))
const metadata=row=>({snapshotHash:row.trainingPersistenceSnapshotHash,attemptId:row.id,attemptEpoch:row.attemptEpoch,courseId:row.deliveryCourseId,checkpoint:row.trainingPersistenceSnapshot.policy.checkpoint,localCognitive:row.trainingPersistenceSnapshot.policy.localCognitive})

export function c26ExecutionPlan(){
 const reads=category=>[...Array.from({length:4},(_,sample)=>({step:'serial-read',category,sample,requests:1})),{step:'double-read-wave',category,requests:2,concurrency:2}]
 return frozen({phase:'A',coldCounts:{...COLD_COUNTS},coldClaim:'FIRST_MEASURED_NEW_CHAIN_ONLY; NO_EXTRA_WARMUP; NOT_OS_PROCESS_OR_PG_COLD',
  steps:[{step:'separate-setup-ledger'},{step:'one-parent-start'},{step:'new-checkpoint-put'},...reads(READ_CATEGORIES[0]),
   ...NATIVE_TYPES.map(type=>({step:'native-final-once',type})),{step:'original-report-child-once'},{step:'new-composite-export-enqueue-once'},
   {step:'original-export-child-once'},...READ_CATEGORIES.slice(1).flatMap(reads),{step:'verify-durable-facts'}],
  serialRequests:24,concurrentRequests:12,concurrentWaves:6,noReplay:true,noWholeFinal:true,noAutomaticB:true})
}

/** A/B is an independently authorized, accepted read source. It cannot be
 * synthesized from the new single publication or silently replaced mid-run. */
export function freezeIndependentReadScope(input){
 assert.ok(input&&typeof input.teacher?.request==='function')
 assert.equal(typeof input.assertResponse,'function','Actual analysis semantic oracle required')
 const selector=clone(input.selector)
 assert.equal(selector.schemaVersion,1);assert.equal(selector.mode,'PAIRWISE');id(selector.courseId)
 assert.equal(input.route,`/courses/${selector.courseId}/training-analysis`)
 assert.equal(selector.waves.length,2)
 for(const [index,wave] of selector.waves.entries()){
  assert.equal(wave.waveKey,index===0?'wave_a':'wave_b');id(wave.taskId)
  assert.equal(new Date(wave.publication).toISOString(),wave.publication)
  assert.equal(wave.configDigest,null);assert.equal(wave.variantKey,null)
  assert.equal(wave.metrics.length,1);id(wave.metrics[0].itemId);assert.equal(wave.metrics[0].metricKey,'total')
 }
 assert.notEqual(selector.waves[0].taskId,selector.waves[1].taskId)
 assert.notEqual(selector.waves[0].metrics[0].itemId,selector.waves[1].metrics[0].itemId)
 assert.ok(input.sourceIdentity&&Object.keys(input.sourceIdentity).length,'Coordinator must supply verified source/hash/authority binding')
 const sourceIdentity=frozen(clone(input.sourceIdentity))
 return Object.freeze({route:input.route,selector:frozen(selector),sourceIdentity,sourceIdentitySha256:hash(json(sourceIdentity)),teacher:input.teacher,assertResponse:input.assertResponse})
}

export function nativeFinalSpec(attempt,{sjtResponses,loadedSjt,cognitiveFinal,submissionId=randomUUID()}={}){
 const unit=attempt.currentItem;assert.ok(unit);id(attempt.id);id(unit.id)
 assert.ok(Number.isSafeInteger(attempt.attemptEpoch)&&attempt.attemptEpoch>0)
 const base=`${prefix}/attempts/${attempt.id}`
 const header={submissionId,attemptEpoch:attempt.attemptEpoch,definitionHash:unit.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash}
 let route,body
 if(unit.type==='FORM_SECTION'){
  assert.equal(unit.answers.length,1);assert.equal(unit.answers[0].label,'c25 answer')
  route=`${base}/form-sections/${unit.id}/submit`
  body={...header,answers:unit.answers.map(answer=>({formItemId:answer.formItemId,value:'yes'}))}
 }else if(unit.type==='SCALE'){
  const definition=unit.scale.definition,sets=new Map((definition.responseSets??[]).map(set=>[set.key,set.options]))
  assert.equal(definition.items.length,1);assert.equal(definition.items[0].itemCode,'mixed-scale-item-1')
  body={...header,answers:definition.items.map(item=>{const options=item.options??sets.get(item.responseSetKey);assert.ok(options.some(option=>option.value==='yes'));return {itemCode:item.itemCode,responseValue:'yes',responseTimeMs:17}})}
  route=`${base}/items/${unit.id}/scale/submit`
 }else if(unit.type==='COGNITIVE'){
  const session=unit.cognitiveSession;id(session.sessionId);assert.equal(session.config.totalTrials,120);assert.equal(typeof cognitiveFinal,'function')
  body=cognitiveFinal(session);body.submissionId=submissionId
  assert.equal(body.trials.length,120);assert.equal(body.attemptEpoch,session.attemptEpoch)
  assert.equal(body.definitionHash,session.definitionHash);assert.equal(body.contextSnapshotHash,session.contextSnapshotHash)
  assert.deepEqual(body.trials.map(trial=>trial.trialIndex),Array.from({length:120},(_,index)=>index))
  route=`/cognitive/sessions/${session.sessionId}/submit`
 }else{
  assert.equal(unit.type,'SITUATIONAL');id(unit.situationalAttemptId)
  assert.equal(loadedSjt.instrument.online.responseProtocol,'sjt-online-response-v1')
  assert.ok(sjtResponses&&typeof sjtResponses==='object')
  body={submissionId,attemptEpoch:loadedSjt.attempt.attemptEpoch,definitionHash:loadedSjt.attempt.definitionHash,
   compiledRuntimeHash:loadedSjt.attempt.compiledRuntimeHash,scoringVersion:loadedSjt.attempt.scoringVersion,responseProtocol:'sjt-online-response-v1',responses:clone(sjtResponses)}
  route=`${base}/items/${unit.id}/situational/${unit.situationalAttemptId}/submit`
 }
 id(submissionId);sha(body.definitionHash)
 assert.ok(body.contextSnapshotHash===undefined||body.contextSnapshotHash===null||/^[a-f0-9]{64}$/.test(body.contextSnapshotHash))
 return {type:unit.type,route,method:'POST',body}
}

export function assertCheckpointRecovery(value,{envelope,parent,checkpoint}){
 assert.equal(value.closed,undefined);assert.equal(value.revision,1);assert.equal(value.successfulSaveCount,1)
 assert.deepEqual(value.envelope,envelope);assert.deepEqual(value.discardedTerminalSlotKeys,[])
 assert.equal(new Date(value.expiresAt).toISOString(),new Date(checkpoint.expiresAt).toISOString())
 assert.deepEqual(value.trainingPersistence,metadata(parent));return true
}
export function assertAcceptedSnapshots(facts,steps){
 assert.deepEqual(steps.map(step=>step.type),NATIVE_TYPES.slice(0,steps.length))
 assert.equal(facts.snapshots.length,steps.length);assert.equal(new Set(facts.snapshots.map(row=>row.slotKey)).size,steps.length)
 for(const step of steps){
  const snapshot=facts.snapshots.find(row=>row.unitType===step.type);assert.ok(snapshot)
  assert.equal(snapshot.compositeAttemptId,facts.parent.id);assert.equal(snapshot.attemptEpoch,facts.parent.attemptEpoch)
  assert.equal(snapshot.terminalState,'COMPLETED');assert.equal(snapshot.sourceSubmissionId,step.body.submissionId)
  assert.equal(snapshot.sourceDefinitionHash,step.body.definitionHash)
  const rows=facts[{FORM_SECTION:'forms',SCALE:'scales',COGNITIVE:'cognitive',SITUATIONAL:'sjt'}[step.type]]
  assert.equal(rows.length,1);assert.equal(rows[0].status,'COMPLETED');assert.equal(rows[0].submissionId,step.body.submissionId)
  assert.equal(snapshot.sourceAttemptId,rows[0].id)
  assert.ok(step.type==='FORM_SECTION'?snapshot.collectionFactsEncrypted:snapshot.canonicalResultEncrypted)
 }
 return true
}
export function assertOriginalReportDrain({baseline,before,after,steps}){
 assertAcceptedSnapshots(before,steps);assertAcceptedSnapshots(after,steps)
 assert.equal(before.jobs.length,1);assert.equal(after.jobs.length,1)
 const b=before.jobs[0],a=after.jobs[0]
 assert.equal(before.parent.status,'IN_PROGRESS');assert.equal(after.parent.status,'COMPLETED');assert.ok(after.parent.completedAt)
 assert.equal(b.status,'PENDING');assert.equal(b.attemptCount,0);assert.equal(b.budgetHeld,true)
 assert.equal(a.id,b.id);assert.equal(a.status,'READY');assert.equal(a.attemptCount,1);assert.equal(a.budgetHeld,false)
 for(const job of [b,a]){assert.equal(job.attemptId,after.parent.id);assert.equal(job.attemptEpoch,after.parent.attemptEpoch);assert.equal(job.wholeSubmissionId,null);assert.equal(job.requestedRevision,4)}
 assert.equal(a.claimedRevision,4);assert.equal(after.parent.asyncReportEpoch,after.parent.attemptEpoch)
 for(const key of ['snapshots','forms','scales','cognitive','sjt','formAnswers','scaleFacts','cognitiveRaw','situationalRaw'])assert.deepEqual(after[key],before[key],`Original drain changed accepted ${key}`)
 assert.deepEqual(before.otherJobs,baseline.jobs);assert.deepEqual(after.otherJobs,baseline.jobs)
 assert.deepEqual(before.queue,{...baseline.queue,pending:baseline.queue.pending+1});assert.deepEqual(after.queue,baseline.queue)
 assert.ok(before.checkpoint.payloadEncrypted&&before.checkpoint.payloadHash&&before.checkpoint.expiresAt)
 for(const key of ['payloadEncrypted','payloadHash','expiresAt'])assert.equal(after.checkpoint[key],null)
 assert.equal(after.checkpoint.successfulSaveCount,1);assert.equal(after.checkpoint.revision,before.checkpoint.revision+1)
 const stable=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['payloadEncrypted','payloadHash','expiresAt','revision','updatedAt'].includes(key)))
 assert.deepEqual(stable(after.checkpoint),stable(before.checkpoint));return true
}

/** Exact one endpoint per category. No status, history or sources lookup hides
 * inside a sample. Artifact checks use the first measured download itself. */
export function readRouteSpecs({attemptId,sessionId,artifactId,productId,student,teacher,independentReadScope}){
 const base=`${prefix}/attempts/${id(attemptId)}`
 return Object.freeze({
  [READ_CATEGORIES[0]]:{client:student,route:base+'/checkpoint',method:'GET'},
  [READ_CATEGORIES[1]]:{client:student,route:base+'/report-status',method:'GET'},
  [READ_CATEGORIES[2]]:{client:student,route:base+'/report',method:'GET'},
  [READ_CATEGORIES[3]]:{client:student,route:`/cognitive/sessions/${id(sessionId)}`,method:'GET'},
  [READ_CATEGORIES[4]]:{client:independentReadScope.teacher,route:independentReadScope.route,method:'POST',body:{selector:independentReadScope.selector},readOnly:true},
  [READ_CATEGORIES[5]]:{client:teacher,route:`${prefix}/${id(productId)}/export/artifacts/${id(artifactId)}`,method:'GET',raw:true},
 })
}

async function defaultRuntime(){
 const {runtime}=await import('./c25-client.mjs'),api=await runtime()
 const {loadStoredCanonicalUnitResult}=api.require(path.join(api.backend,'dist/modules/assessment-runtime/compact-assessment-storage.js'))
 return {...api,loadStoredCanonicalUnitResult}
}
const defaultFixture=()=>import('./c25-fixture.mjs')
async function readNewFacts(api,attemptId){
 const {prisma}=api,c=await api.children(attemptId),ids=rows=>rows.map(row=>row.id)
 return {parent:await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attemptId}}),
  ...Object.fromEntries(Object.entries(c).map(([key,rows])=>[key,sorted(rows)])),
  checkpoint:await prisma.trainingAttemptCheckpoint.findUniqueOrThrow({where:{attemptId}}),
  formAnswers:await prisma.compositeFormAnswer.findMany({where:{attemptId},orderBy:{id:'asc'}}),
  scaleFacts:await prisma.assessmentResultFact.findMany({where:{assessmentId:{in:ids(c.scales)}},orderBy:{assessmentId:'asc'}}),
  cognitiveRaw:await prisma.cognitiveRawSubmission.findMany({where:{sessionId:{in:ids(c.cognitive)}},orderBy:{id:'asc'}}),
  situationalRaw:await prisma.situationalRawSubmission.findMany({where:{attemptId:{in:ids(c.sjt)}},orderBy:{id:'asc'}}),
  queue:await prisma.compositeReportQueueBudget.findUniqueOrThrow({where:{id:'reports'}}),
  otherJobs:await prisma.compositeReportJob.findMany({where:{attemptId:{notIn:[attemptId]}},orderBy:{id:'asc'}})}
}
async function acceptedSemantics(api,facts){
 assert.equal(facts.formAnswers.length,1);assert.equal(facts.formAnswers[0].value,'yes')
 assert.equal(facts.scaleFacts.length,1);assert.equal(facts.cognitiveRaw.length,1);assert.equal(facts.cognitiveRaw[0].trialCount,120);assert.equal(facts.situationalRaw.length,1)
 const semantics={form:'yes',cognitiveTrialCount:120}
 for(const type of NATIVE_TYPES.slice(1)){
  const snapshot=facts.snapshots.find(row=>row.unitType===type)
  const value=await api.loadStoredCanonicalUnitResult(snapshot.canonicalResultEncrypted,api.prisma)
  assert.equal(value.core.unitType,type);assert.ok(value.core.metrics.length>0);sha(value.resultHash)
  if(type==='SCALE')assert.equal(value.core.metrics.find(metric=>metric.key==='total')?.value,1)
  if(type==='SITUATIONAL')assert.equal(value.core.metrics.find(metric=>metric.key==='cooperation')?.value,9)
  semantics[type]={resultHash:value.resultHash,metrics:value.core.metrics}
 }
 return semantics
}

/** Every step is finite and single-use, including after a thrown/uncertain
 * operation. Only the coordinator may start this object, and it cannot resume
 * or retry it. New authorization and a separate evidence decision are needed. */
export function createC26Workload(h,{measure,reportChild,exportChild,independentReadScope,runtimeLoader=defaultRuntime,fixtureLoader=defaultFixture,uuid=randomUUID}={}){
 for(const key of ['client','write','read','remaining','check'])assert.equal(typeof h[key],'function',`Raw harness ${key} required`)
 assert.equal(typeof measure,'function');assert.equal(typeof reportChild,'function');assert.equal(typeof exportChild,'function')
 const analysis=freezeIndependentReadScope(independentReadScope),ledger=[],steps=[],issued=new Set(),counts={phase:'A',cold:Object.fromEntries(Object.keys(COLD_COUNTS).map(key=>[key,0])),serialRequests:0,concurrentWaves:0,concurrentRequests:0,maxConcurrency:0,extraFinals:0,automaticRetries:0}
 let phase='new',stopped=false,active=false,serial=0,api,fixtureModule,f,product,student,teacher,attempt,baseline,envelope,checkpointParent,checkpointSaved,before,after,artifact,batch,semantics,artifactHash
 const privateWrite=(name,value)=>h.write(name,value)
 const record=entry=>{ledger.push(entry);privateWrite('c25-c26-workload-ledger-private.json',{schemaVersion:1,ledger})}
 const once=async(name,run)=>{assert.ok(!stopped&&!issued.has(name),'Workload stopped or operation already issued');h.remaining();issued.add(name);record({event:'ISSUED',id:name,phase});try{const value=await run();record({event:'RECEIVED',id:name,phase});return value}catch(error){stopped=true;record({event:'FAILED_OR_UNCERTAIN',id:name,phase,errorClass:error.name});throw error}}
 const request=async(client,spec,meta={})=>{
  const op={id:meta.id??`http-${++serial}`,phase:meta.phase??phase,route:spec.route,method:spec.method??'GET',requests:1,...meta}
  assert.ok(op.route.startsWith('/')&&!op.route.startsWith('/api/')&&!op.route.includes('/metrics'))
  op.kind=op.method==='GET'||spec.readOnly===true?'read':'write'
  const transportMeta={label:op.id,...(spec.readOnly===true?{readOnlyAnalysis:true,bodySha256:hash(json(spec.body))}:{})}
  const perform=()=>client.request(op.route,op.method,spec.body,200,spec.raw===true,transportMeta)
  return once(op.id,()=>meta.waveMember?perform():measure(op,perform))
 }
 const wrapSetup=raw=>{const wrapper=Object.create(raw);wrapper.request=(route,method='GET',body,expected=200,rawBytes=false)=>{assert.equal(expected,200);return request(raw,{route,method,body,raw:rawBytes},{phase:'setup'})};wrapper.login=(who,role)=>raw.login.call(wrapper,who,role);return wrapper}
 // c25 seed's source reads remain unchanged; its private output is redirected
 // so no accepted C25 fixture or old checkpoint is overwritten or recovered.
 const setupH={...h,client:()=>wrapSetup(h.client()),write:(name,value)=>privateWrite(name==='c25-fixture-private.json'?'c25-c26-fixture-private.json':name,value)}
 const enter=async(expected,next,run)=>{assert.ok(!active&&!stopped&&phase===expected,`Expected ${expected}; received ${phase}`);active=true;phase=next;try{return await run()}catch(error){stopped=true;throw error}finally{active=false}}
 const persistence=row=>{assert.deepEqual(row.trainingFeedbackSnapshot.policy,{schemaVersion:1,mode:'IMMEDIATE'});assert.deepEqual(row.trainingPersistenceSnapshot.policy,PERSISTENCE);assert.deepEqual(attempt.trainingPersistence,metadata(row))}
 async function sampled(category,spec,check){
  for(let sample=0;sample<4;sample++){
   const value=await request(spec.client,spec,{id:`serial-${category}-${sample}`,phase:'serial',category,sample});await check(value);counts.serialRequests++
  }
  const waveId=`wave-${category}`
  await once(waveId,()=>measure({id:waveId,phase:'wave',category,requests:2,concurrency:2,sqlAttribution:'ONE_WAVE_PROCESS_TOTAL'},async()=>{
   const values=await Promise.allSettled([0,1].map(member=>request(spec.client,spec,{id:`${waveId}-${member}`,phase:'wave-member',category,waveMember:true})))
   // Wait for both requests to settle even if one failed; never overlap the
   // following sample or conceal a still-running request after rejection.
   for(const value of values){if(value.status==='rejected')throw value.reason;await check(value.value)}
  }))
  counts.concurrentWaves++;counts.concurrentRequests+=2;counts.maxConcurrency=2
 }
 const driver={
  async prepare(){return enter('new','setup',async()=>{
   api=await runtimeLoader();fixtureModule=await fixtureLoader()
   baseline={parents:await api.prisma.compositeAssessmentAttempt.count(),queue:await api.prisma.compositeReportQueueBudget.findUniqueOrThrow({where:{id:'reports'}}),jobs:await api.prisma.compositeReportJob.findMany({orderBy:{id:'asc'}}),batches:await api.prisma.exportBatch.findMany({orderBy:{id:'asc'}}),artifacts:await api.prisma.exportArtifact.findMany({orderBy:{id:'asc'}})}
   privateWrite('c25-c26-workload-baseline-private.json',baseline)
   f=await once('fixture-setup',()=>fixtureModule.seed(setupH));teacher=h.client();student=h.client()
   await wrapSetup(teacher).login(f.actors.teacher,'TEACHER');await wrapSetup(student).login(f.actors.student,'STUDENT')
   product=await once('product-draft',()=>fixtureModule.draftProduct(wrapSetup(teacher),f,{name:'C26 first measured four-tool',four:true}))
   const expiresAt=product.expiresAt;assert.ok(Number.isFinite(Date.parse(expiresAt)))
   product=await once('product-publish',()=>fixtureModule.publish(wrapSetup(teacher),product));assert.equal(product.expiresAt,expiresAt,'Keep actual publication expiry; no +1 ms')
   const row=await api.prisma.compositeAssessment.findUniqueOrThrow({where:{id:product.id}})
   assert.deepEqual(row.trainingFeedbackPolicy,{schemaVersion:1,mode:'IMMEDIATE'});assert.deepEqual(row.trainingPersistencePolicy,PERSISTENCE)
   assert.equal(new Date(row.expiresAt).toISOString(),new Date(product.expiresAt).toISOString())
   f.products.C26=product;setupH.write('c25-fixture-private.json',f)
   privateWrite('c25-c26-independent-read-scope-private.json',{route:analysis.route,selector:analysis.selector,sourceIdentity:analysis.sourceIdentity,sourceIdentitySha256:analysis.sourceIdentitySha256})
   return {productId:product.id,expiresAt:product.expiresAt}
  })},
  async startAndSaveCheckpoint(){return enter('setup','cold-admission',async()=>{
   const started=await request(student,{route:`${prefix}/${id(product.id)}/attempts`,method:'POST',body:{}},{id:'cold-parent-start',phase:'cold'})
   attempt=started.attempt;assert.equal(attempt.status,'IN_PROGRESS');assert.equal(attempt.currentItem.type,'FORM_SECTION');counts.cold.parentAttempts++
   checkpointParent=await api.prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attempt.id}});persistence(checkpointParent)
   assert.equal(checkpointParent.compositeAssessmentId,product.id);assert.equal(checkpointParent.userId,f.actors.student.id)
   assert.equal(await api.prisma.trainingAttemptCheckpoint.findUnique({where:{attemptId:attempt.id}}),null,'Only a new checkpoint may be saved')
   envelope=await fixtureModule.checkpointEnvelope({attempt,base:prefix,client:student,token:null})
   assert.equal(envelope.drafts.length,3);assert.deepEqual(envelope.cognitiveResults,[])
   const saved=await request(student,{route:`${prefix}/attempts/${attempt.id}/checkpoint`,method:'PUT',body:{expectedRevision:0,attemptEpoch:attempt.attemptEpoch,envelope}},{id:'cold-checkpoint-save',phase:'cold'})
   assert.equal(saved.revision,1);assert.equal(saved.successfulSaveCount,1)
   checkpointSaved=await api.prisma.trainingAttemptCheckpoint.findUniqueOrThrow({where:{attemptId:attempt.id}})
   assert.ok(checkpointSaved.payloadEncrypted&&checkpointSaved.payloadHash&&checkpointSaved.expiresAt)
   assert.equal(new Date(checkpointSaved.expiresAt).toISOString(),new Date(product.expiresAt).toISOString())
   privateWrite('c25-c26-checkpoint-private.json',{parent:checkpointParent,checkpoint:checkpointSaved,envelope})
   return {attemptId:attempt.id,attemptEpoch:attempt.attemptEpoch}
  })},
  async readCheckpoint(){return enter('cold-admission','checkpoint-reads',async()=>{
   await sampled(READ_CATEGORIES[0],{client:student,route:`${prefix}/attempts/${attempt.id}/checkpoint`,method:'GET'},value=>assertCheckpointRecovery(value,{envelope,parent:checkpointParent,checkpoint:checkpointSaved}))
   assert.deepEqual(await api.prisma.trainingAttemptCheckpoint.findUniqueOrThrow({where:{attemptId:attempt.id}}),checkpointSaved,'Recovery samples must leave new checkpoint row byte-exact')
  })},
  async submitFour(){return enter('checkpoint-reads','cold-finals',async()=>{
   for(const type of NATIVE_TYPES){
    assert.equal(attempt.currentItem.type,type)
    const unit=attempt.currentItem;let loadedSjt
    if(type==='COGNITIVE'){
     const native=await request(student,{route:`/cognitive/sessions/${id(unit.cognitiveSession.sessionId)}`},{id:'cold-cognitive-native-read',phase:'cold'})
     assert.deepEqual(native.trainingPersistence,metadata(checkpointParent))
    }
    if(type==='SITUATIONAL')loadedSjt=await request(student,{route:`${prefix}/attempts/${attempt.id}/items/${id(unit.id)}/situational/${id(unit.situationalAttemptId)}`},{id:'cold-sjt-native-read',phase:'cold'})
    const spec=nativeFinalSpec(attempt,{sjtResponses:f.sjtResponses,loadedSjt,cognitiveFinal:api.cognitiveFinal,submissionId:uuid()})
    privateWrite(`c25-c26-final-${type.toLowerCase().replaceAll('_','-')}-private.json`,spec)
    const response=await request(student,spec,{id:`cold-${type.toLowerCase().replaceAll('_','-')}-final`,phase:'cold'})
    assert.equal(response.replayed,false,'No FINAL replay is permitted');steps.push(spec)
    counts.cold[{FORM_SECTION:'formFinals',SCALE:'scaleFinals',COGNITIVE:'cognitiveFinals',SITUATIONAL:'sjtFinals'}[type]]++
    const facts=await readNewFacts(api,attempt.id);assertAcceptedSnapshots(facts,steps)
    if(type!=='SITUATIONAL')attempt=await request(student,{route:`${prefix}/attempts/${attempt.id}`},{id:`cold-after-${type.toLowerCase().replaceAll('_','-')}`,phase:'cold'})
   }
   before=await readNewFacts(api,attempt.id);assert.equal(before.jobs.length,1);counts.cold.reportJobs=1
   semantics=await acceptedSemantics(api,before)
   privateWrite('c25-c26-before-report-private.json',{facts:before,semantics})
   return {attemptId:attempt.id,attemptEpoch:attempt.attemptEpoch,jobId:before.jobs[0].id,oldJobIds:baseline.jobs.map(row=>row.id)}
  })},
  async drainOriginalReport(){return enter('cold-finals','cold-report',async()=>{
   const input={attemptId:attempt.id,attemptEpoch:attempt.attemptEpoch,jobId:before.jobs[0].id,oldJobIds:baseline.jobs.map(row=>row.id)}
   const evidence=await once('original-report-child',()=>reportChild(input));counts.cold.reportDrainInvocations++
   after=await readNewFacts(api,attempt.id);assertOriginalReportDrain({baseline,before,after,steps})
   privateWrite('c25-c26-after-report-private.json',{facts:after,child:evidence});return input
  })},
  async createOriginalExport(){return enter('cold-report','cold-export',async()=>{
   // Composite exports accept the request key in an HTTP header, not the JSON
   // body. This single-use raw-client contract adds no header or retry: retain
   // the actual server-generated batch requestKey and original queued job.
   const queued=await request(teacher,{route:`${prefix}/${product.id}/export`,method:'POST',body:{detail:'full',format:'csv'}},{id:'cold-export-enqueue',phase:'cold'})
   assert.equal(queued.replayed,false);assert.equal(queued.status,'PROCESSING');assert.equal(queued.artifacts.length,1);id(queued.batchId);counts.cold.exportEnqueues++
   artifact=queued.artifacts[0];id(artifact.id);assert.equal(artifact.format,'csv')
   assert.equal(artifact.downloadUrl,`/api${prefix}/${product.id}/export/artifacts/${artifact.id}`)
   batch=await api.prisma.exportBatch.findUniqueOrThrow({where:{id:queued.batchId}})
   assert.equal(batch.status,'PROCESSING');assert.equal(batch.resourceType,'COMPOSITE');assert.equal(batch.resourceId,product.id);assert.equal(batch.createdBy,f.actors.teacher.id);id(batch.requestKey)
   const childInput={batchId:batch.id,artifactId:artifact.id,productId:product.id}
   const evidence=await once('original-export-child',()=>exportChild(childInput));counts.cold.exportTasks++
   const ready=await api.prisma.exportBatch.findUniqueOrThrow({where:{id:batch.id}}),rows=await api.prisma.exportArtifact.findMany({where:{batchId:batch.id},orderBy:{id:'asc'}})
   assert.equal(ready.status,'READY');assert.equal(ready.recordCount,1);assert.deepEqual(ready.options,batch.options);assert.equal(ready.requestKey,batch.requestKey);assert.equal(ready.requestHash,batch.requestHash)
   assert.equal(rows.length,1);assert.equal(rows[0].id,artifact.id);assert.equal(rows[0].status,'READY');assert.equal(rows[0].resourceId,product.id)
   privateWrite('c25-c26-export-private.json',{queued,before:batch,after:ready,artifact:rows[0],child:evidence});return childInput
  })},
  async readRemaining(){return enter('cold-export','remaining-reads',async()=>{
   // Frozen post-completion order: for each category below, four serial reads
   // followed immediately by that category's one two-request wave.
   const specs=readRouteSpecs({attemptId:attempt.id,sessionId:after.cognitive[0].id,artifactId:artifact.id,productId:product.id,student,teacher,independentReadScope:analysis})
   const checks={
    [READ_CATEGORIES[1]]:value=>{assert.equal(value.status,'COMPLETED');assert.equal(value.reportStatus.state,'READY');assert.equal(value.participantFeedback.state,'AVAILABLE')},
    [READ_CATEGORIES[2]]:value=>{assert.deepEqual(value.unitReports.map(row=>row.type).sort(),['COGNITIVE','SCALE','SITUATIONAL']);assert.equal(value.backgroundValues.length,1)},
    [READ_CATEGORIES[3]]:value=>{assert.notEqual(value.feedbackDeferred,true);assert.ok(value.result||value.score!=null);assert.deepEqual(value.trainingPersistence,metadata(after.parent))},
    [READ_CATEGORIES[4]]:value=>analysis.assertResponse(value),
    [READ_CATEGORIES[5]]:bytes=>{assert.ok(Buffer.isBuffer(bytes)&&bytes.length>0);const digest=hash(bytes);if(artifactHash)assert.equal(digest,artifactHash);else artifactHash=digest
     const csv=api.parseCsv(bytes);assert.equal(csv.rows.length,1);assert.equal(csv.rows[0].A_attempt_id,attempt.id);assert.ok(csv.columns.some(column=>column.startsWith('S002_')));assert.ok(csv.columns.some(column=>column.startsWith('C003_')));assert.ok(csv.columns.some(column=>column.startsWith('J004_')))},
   }
   for(const category of READ_CATEGORIES.slice(1))await sampled(category,specs[category],checks[category])
  })},
  async finish(){return enter('remaining-reads','complete',async()=>{
   assert.deepEqual(await readNewFacts(api,attempt.id),after,'Consumer reads/exports changed accepted new facts')
   assert.equal(await api.prisma.compositeAssessmentAttempt.count(),baseline.parents+1)
   const batches=await api.prisma.exportBatch.findMany({orderBy:{id:'asc'}}),artifacts=await api.prisma.exportArtifact.findMany({orderBy:{id:'asc'}})
   assert.equal(batches.length,baseline.batches.length+1);assert.equal(artifacts.length,baseline.artifacts.length+1)
   assert.deepEqual(batches.filter(row=>row.id!==batch.id),baseline.batches);assert.deepEqual(artifacts.filter(row=>row.id!==artifact.id),baseline.artifacts)
   assertWorkloadCounts(counts)
   const result={schemaVersion:1,counts:clone(counts),attemptId:attempt.id,productId:product.id,jobId:after.jobs[0].id,batchId:batch.id,artifactId:artifact.id,artifactSha256:artifactHash,semantics,
    independentReadScopeSha256:analysis.sourceIdentitySha256,coldClaim:c26ExecutionPlan().coldClaim,newCheckpointPayloadCleared:true,acceptedFactsUnchanged:true}
   privateWrite('c25-c26-workload-result-private.json',result);h.result.c26Workload=result
   h.check('C26 one new four-native-FINAL chain, original report/export tasks, 24 serial reads and six double-read waves retained durable facts')
   return result
  })},
  state:()=>({phase,stopped,active,issued:issued.size,counts:clone(counts)}),
 }
 return Object.freeze(driver)
}
export async function runC26Workload(h,options){
 const driver=createC26Workload(h,options)
 await driver.prepare();await driver.startAndSaveCheckpoint();await driver.readCheckpoint();await driver.submitFour()
 await driver.drainOriginalReport();await driver.createOriginalExport();await driver.readRemaining();return driver.finish()
}
