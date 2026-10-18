/** Exact state04 missing-assert continuation; accepted quota/restart races are never replayed. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {harness,prisma,PrismaClient,children,candidateProof,noWrites,denied,sha,require,backend,prefix,pub,pause,products} from './c20-materials-client.mjs'
import {logins,participant,formMaterialProduct,form,formRows,unitKey,publish,formBody,expiry} from './c20-materials-fixture.mjs'
const {canonicalHash}=require(path.join(backend,'dist/modules/assessment-runtime/canonical.js'))
const {trainingFlowSchema}=require(path.join(backend,'dist/modules/questionnaire-product/training-flow-authoring.js'))
const {parseTrainingFlowDraft}=require(path.join(backend,'dist/modules/assessment-core/flow/training.js'))
const h=harness('race');let error
async function drainReports(h,attemptIds){
 const {claimCompositeReportJob}=require(path.join(backend,'dist/modules/assessment-runtime/report-outbox.service.js'))
 const {processCompositeReportJob}=require(path.join(backend,'dist/workers/compositeReportWorker.js'))
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('connection_limit','1');url.searchParams.set('application_name','c20_original_outbox_preservation')
 const gate=new PrismaClient({datasources:{db:{url:url.toString()}}})
 let release,arrived,rejectReady;const hold=new Promise(r=>release=r),ready=new Promise((r,j)=>{arrived=r;rejectReady=j})
 const transaction=gate.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM composite_report_jobs WHERE NOT (attempt_id=ANY($1::text[])) FOR UPDATE',attemptIds);arrived();await hold},{maxWait:10000,timeout:120000});transaction.catch(rejectReady)
 const processed=[]
 try{
  await ready
  const expected=await prisma.compositeReportJob.findMany({where:{attemptId:{in:attemptIds}}})
  assert.equal(expected.length,attemptIds.length,'every accepted completed fixture needs one original outbox')
  for(const target of expected){
   if(target.status==='READY')continue
   const job=await claimCompositeReportJob();assert.ok(job,'completed fixture outbox must be genuinely claimable');assert.ok(attemptIds.includes(job.attemptId),'nonfixture job must remain locked and untouched')
   await processCompositeReportJob(job)
   const final=await prisma.compositeReportJob.findUniqueOrThrow({where:{id:job.id}});assert.equal(final.status,'READY','original report processing failed; do not forge or reset its outbox')
   assert.equal(final.attemptCount,1,'first report materialization must use one original claim')
   processed.push({attemptId:job.attemptId,jobId:job.id,attemptCount:final.attemptCount,requestedRevision:final.requestedRevision,status:final.status})
  }
  for(const target of expected)assert.equal((await prisma.compositeReportJob.findUniqueOrThrow({where:{attemptId_attemptEpoch:{attemptId:target.attemptId,attemptEpoch:target.attemptEpoch}}})).status,'READY')
 }finally{release();await transaction;await gate.$disconnect()}
 h.result.originalOutboxProcessed=processed
 return processed
}
async function collide(productId,operations,label,subjectLock=null){
 const u=new URL(process.env.DATABASE_URL);u.searchParams.set('connection_limit','1');u.searchParams.set('application_name','c20_'+label)
 const gate=new PrismaClient({datasources:{db:{url:u.toString()}}});let release,arrive,reject;const hold=new Promise(r=>release=r),ready=new Promise((r,j)=>{arrive=r;reject=j});let pending=[]
 const held=gate.$transaction(async tx=>{if(subjectLock)await tx.$queryRawUnsafe('SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended($1,0))',subjectLock);else await tx.$queryRawUnsafe('SELECT id FROM composite_assessments WHERE id=$1 FOR UPDATE',productId);const [{pid}]=await tx.$queryRawUnsafe('SELECT pg_backend_pid()::int pid');arrive(pid);await hold},{timeout:30000,maxWait:10000});held.catch(reject)
 try{
  const pid=await ready;pending=operations.map(fn=>{const r={settled:false};r.promise=fn().then(v=>{r.value=v;r.settled=true},e=>{r.error=e;r.settled=true});return r});let waiters=[]
  const end=Date.now()+8000;while(Date.now()<end){assert.ok(pending.every(r=>!r.settled),'request escaped held definition lock');const rows=await prisma.$queryRawUnsafe("SELECT pid::int pid,pg_blocking_pids(pid)::int[] blockers FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND wait_event_type='Lock' AND pid<>pg_backend_pid()");waiters=rows.filter(r=>r.blockers.includes(pid)||r.blockers.some(b=>rows.some(q=>q.pid===b&&q.blockers.includes(pid))));if(waiters.length===2)break;await pause(20)}
  assert.equal(waiters.length,2,'two actual PostgreSQL blocked writers required');release();await held;await Promise.all(pending.map(r=>r.promise));for(const r of pending)if(r.error)throw r.error;h.result.measurements.push({label,actualPgWaiters:waiters});return pending.map(r=>r.value)
 }finally{release();await held;await Promise.allSettled(pending.map(r=>r.promise));await gate.$disconnect()}
}
function boundedTokenExpiry(product){
 const now=Date.now(),end=new Date(product.expiresAt).getTime();assert.ok(Number.isFinite(end)&&end>now+60000)
 const expiresAt=new Date(Math.min(now+1800000,end-1000)).toISOString()
 assert.ok(Date.parse(expiresAt)>now&&Date.parse(expiresAt)<=end&&Date.parse(expiresAt)<now+365*86400000)
 return expiresAt
}
async function assertRotated(label,product,client,first,next,before,token,uses){
 assert.notEqual(next.recoveryToken,first.recoveryToken);assert.ok(next.recoveryToken)
 const old=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:first.attempt.id}}),fresh=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:next.attempt.id}})
 assert.equal(old.status,'ABANDONED');assert.equal(old.recoveryTokenHash,null);assert.ok(fresh.recoveryTokenHash)
 assert.equal(fresh.participantKey,before.participantKey);assert.equal(fresh.anonymousCode,before.anonymousCode)
 assert.equal(fresh.attemptNo,before.attemptNo+1);assert.equal(fresh.attemptEpoch,before.attemptEpoch+1)
 assert.equal(await prisma.trainingMaterialAllocationClaim.count({where:{compositeId:product.id}}),0)
 assert.equal(await prisma.trainingMaterialQuotaBucket.count({where:{compositeId:product.id}}),0)
 assert.equal((await prisma.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:token.id}})).usedCount,uses)
 assert.equal((await children(first.attempt.id)).forms.length,1);assert.equal((await children(next.attempt.id)).forms.length,1)
 await noWrites(h,label+' retired parent and real Form section submit reject',async()=>{
  await client.request(`${pub}/attempts/${first.attempt.id}`,'GET',undefined,denied)
  await client.request(`${pub}/attempts/${next.attempt.id}`,'GET',undefined,denied)
  await client.request(`${pub}/attempts/${first.attempt.id}/restart`,'POST',{},denied)
  await client.request(`${pub}/attempts/${first.attempt.id}/form-sections/${first.attempt.currentItem.id}/submit`,'POST',formBody(first.attempt),denied)
 })
 client.recovery=next.recoveryToken;assert.equal((await client.request(`${pub}/attempts/${next.attempt.id}`)).id,next.attempt.id)
 if(label==='V1'){
  for(const id of [first.attempt.id,next.attempt.id]){const proof=await candidateProof(id);assert.equal(proof.candidate.schemaVersion,1);assert.equal(proof.candidate.materialAssignment,undefined)}
 }else{assert.equal(old.trainingFlowSnapshotEncrypted,null);assert.equal(fresh.trainingFlowSnapshotEncrypted,null)}
 const active=await client.request(`${pub}/attempts/${next.attempt.id}`)
 await client.request(`${pub}/attempts/${next.attempt.id}/form-sections/${active.currentItem.id}/submit`,'POST',formBody(active))
 await client.request(`${pub}/attempts/${next.attempt.id}`);await drainReports(h,[next.attempt.id]);assert.equal((await client.request(`${pub}/attempts/${next.attempt.id}`)).status,'COMPLETED')
 assert.equal((await children(next.attempt.id)).snapshots.length,1)
 h.result.measurements.push({label,productId:product.id,oldAttemptId:first.attempt.id,replacementId:next.attempt.id,stableParticipant:true,rotatedCredential:true,tokenUses:uses,materialClaims:0})
 h.check(label+' ordinary anonymous restart keeps participant and anonymous code, rotates credential, revokes old parent/native and retains zero material allocation')
}
try{
 const priorFile=path.join(h.state,'c20-prior-race-failed-result.json'),prior=h.read('c20-prior-race-failed-result.json')
 assert.equal(sha(fs.readFileSync(priorFile)),'2f1061ecc1333dd5c01e28b624f2ade6614ee1ed3e1aa1319b43f32aa661a11f')
 assert.equal(prior.passed,false);assert.deepEqual(prior.checks,[]);assert.equal(prior.error.message,'No CompositeReportJob found')
 assert.deepEqual(prior.measurements.map(m=>m.label),['legacy_start_restart']);assert.equal(prior.measurements[0].actualPgWaiters.length,2)
 const journalFile=path.join(h.state,'c20-race-http-private.jsonl');assert.equal(sha(fs.readFileSync(journalFile)),'bacaae15347a3c7e95ce8e88069b5b7e7fc3a9d7a107d03300723dee9bbfe7f4')
 const journal=fs.readFileSync(journalFile,'utf8').trim().split('\n').map(line=>JSON.parse(line))
 const received=journal.filter(r=>r.stage==='RECEIVED'&&r.response!=='AUTH_REDACTED').map(r=>{try{return JSON.parse(r.response).data}catch{return null}}).filter(Boolean)
 const original=received.find(r=>r.attempt?.id==='7394bda8-d2ea-4f61-884b-436e9184382e'&&r.recoveryToken),replacement=received.find(r=>r.attempt?.id==='5009970e-b0da-4dcf-af58-f76c7a8945b6'&&r.recoveryToken)
 assert.ok(original&&replacement);assert.notEqual(original.recoveryToken,replacement.recoveryToken)
 const oldId=original.attempt.id,nextId=replacement.attempt.id,productId='8c9d402b-e411-48b9-acad-666d1bdc6cde'
 for(const [method,route,status] of [['GET',`${pub}/attempts/${oldId}`,403],['POST',`${pub}/attempts/${oldId}/restart`,403],['POST',`${pub}/attempts/${oldId}/form-sections/${original.attempt.currentItem.id}/submit`,403],['POST',`${pub}/attempts/${nextId}/form-sections/${replacement.attempt.currentItem.id}/submit`,200]])assert.ok(prior.requests.some(r=>r.method===method&&r.route===route&&r.status===status))
 const f=h.read('c20-fixture-private.json');assert.equal(sha(fs.readFileSync(path.join(h.state,'c20-fixture-private.json'))),'fd9fbe5a8ba6bbdc24a9674760061c3ff86c24bae809161dc1daaaabdb83e646')
 h.result.priorProducer={resultSha256:'2f1061ecc1333dd5c01e28b624f2ade6614ee1ed3e1aa1319b43f32aa661a11f',runtimeSha256:'c1615d3e8304547d4f21d4ecd376b43a76670076e547eac20396c901a36686ee',journalSha256:'bacaae15347a3c7e95ce8e88069b5b7e7fc3a9d7a107d03300723dee9bbfe7f4',ancestorProducer:prior.priorProducer,reusedChecks:prior.checks,reusedMeasurements:prior.measurements,continuation:'Only read/assert the accepted null replacement FINAL and epoch2 original READY outbox; do not reissue its FINAL, race or retired capability probes. Then execute previously unissued V1 and KEEP_LINKED cases.'}
 const old=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:oldId}}),fresh=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:nextId}})
 assert.equal(old.status,'ABANDONED');assert.equal(old.recoveryTokenHash,null);assert.equal(fresh.status,'COMPLETED');assert.ok(fresh.recoveryTokenHash)
 assert.equal(old.participantKey,fresh.participantKey);assert.equal(old.anonymousCode,fresh.anonymousCode);assert.equal(fresh.attemptNo,old.attemptNo+1);assert.equal(fresh.attemptEpoch,2)
 assert.equal(old.trainingFlowSnapshotEncrypted,null);assert.equal(fresh.trainingFlowSnapshotEncrypted,null)
 assert.equal(await prisma.compositeAssessmentAttempt.count({where:{compositeAssessmentId:productId}}),3)
 assert.equal((await prisma.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:'e640a32b-6cfd-42f7-bf21-b2b809722583'}})).usedCount,2)
 assert.equal(await prisma.trainingMaterialAllocationClaim.count({where:{compositeId:productId}}),0)
 const child=await children(nextId);assert.equal(child.snapshots.length,1);assert.equal(child.forms.length,1);assert.equal(child.forms[0].status,'COMPLETED');assert.equal(child.jobs.length,1)
 const job=child.jobs[0];assert.equal(job.attemptEpoch,2);assert.equal(job.status,'READY');assert.equal(job.attemptCount,1)
 h.result.measurements.push({label:'REUSED_NULL_COMPLETION_ASSERTION',attemptId:nextId,jobId:job.id,attemptEpoch:2,jobStatus:job.status,attemptCount:1,snapshots:1,priorObservedPgWaiters:prior.measurements[0].actualPgWaiters})
 h.check('Previously accepted null replacement FINAL is COMPLETED with one epoch2 original READY outbox; prior credential/native probes and dual PostgreSQL waiters retained without replay')
 const nullClient=h.client();await nullClient.request('/auth/csrf');nullClient.recovery=original.recoveryToken
 await noWrites(h,'Null old credential cannot access replacement ID',async()=>{await nullClient.request(`${pub}/attempts/${nextId}`,'GET',undefined,denied);nullClient.recovery=replacement.recoveryToken;assert.equal((await nullClient.request(`${pub}/attempts/${nextId}`)).id,nextId)})
 const anonymous=h.read('c20-anonymous-result.json');assert.equal(anonymous.passed,true)
 const anonRows=fs.readFileSync(path.join(h.state,'c20-anonymous-http-private.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line))
 const anonReceived=anonRows.filter(r=>r.stage==='RECEIVED'&&r.response!=='AUTH_REDACTED').map(r=>{try{return JSON.parse(r.response).data}catch{return null}}).filter(Boolean)
 const covered=[]
 for(const record of anonymous.measurements.filter(r=>r.oldAttemptId&&r.newAttemptId)){
  const previous=anonReceived.find(r=>r.attempt?.id===record.oldAttemptId&&r.recoveryToken),replacement=anonReceived.find(r=>r.attempt?.id===record.newAttemptId&&r.recoveryToken)
  assert.ok(previous&&replacement);assert.notEqual(previous.recoveryToken,replacement.recoveryToken)
  const client=h.client();await client.request('/auth/csrf');client.recovery=previous.recoveryToken
  await noWrites(h,record.type+' old credential rejects replacement ID; current credential reads same shape',async()=>{await client.request(`${pub}/attempts/${record.newAttemptId}`,'GET',undefined,denied);client.recovery=replacement.recoveryToken;assert.equal((await client.request(`${pub}/attempts/${record.newAttemptId}`)).id,record.newAttemptId)})
  covered.push(record.type)
 }
 assert.deepEqual(covered.sort(),['COGNITIVE','FORM','SCALE','SITUATIONAL'])
 h.check('Existing four V2 anonymous cases reject old credential at replacement ID and accept current credential; no persistence counts change')
 const {teacher}=await logins(h,f)
 let v1=await teacher.request(products,'POST',{requestId:randomUUID(),name:'C20 V1 anonymous credential regression',questionnaireType:'COURSE',courseIds:[f.courseId],publicEnabled:true,expiresAt:expiry()})
 v1=await teacher.request(`${products}/${v1.id}/items`,'POST',{revision:v1.revision,item:form('route')})
 const config={schemaVersion:1,blocks:[{blockKey:'form',kind:'INSTRUMENT',instrumentKey:unitKey(formRows(v1)[0])}]}
 trainingFlowSchema.parse({revision:v1.revision,config});parseTrainingFlowDraft(config)
 v1=await publish(teacher,v1,config)
 const vt=await teacher.request(`${prefix}/${v1.id}/public-tokens`,'POST',{expiresAt:boundedTokenExpiry(v1),maxUses:1}),vc=h.client();await vc.request('/auth/csrf')
 const first=await vc.request(`${pub}/${vt.token}/start`,'POST',{});vc.recovery=first.recoveryToken
 assert.equal((await vc.request(`${pub}/${vt.token}/start`,'POST',{recoveryToken:first.recoveryToken})).attempt.id,first.attempt.id)
 const vb=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:first.attempt.id}}),next=await vc.request(`${pub}/attempts/${first.attempt.id}/restart`,'POST',{})
 await assertRotated('V1',v1,vc,first,next,vb,vt,1)
 const key='c20-first-binding-'+randomUUID(),p1=await formMaterialProduct(teacher,f,{experimentKey:key,limits:null}),p2=await formMaterialProduct(teacher,f,{experimentKey:key,limits:null})
 const seed=await participant(h,f,'binding_scope_seed');await seed.client.request(`${prefix}/${p1.id}/attempts`,'POST',{})
 const scope=await prisma.trainingMaterialExperiment.findFirstOrThrow({where:{ownerId:f.users.teacher.id,courseId:f.courseId,experimentKey:key}}),actor=await participant(h,f,'binding_race'),participantKey='user:'+actor.user.id
 assert.equal(await prisma.trainingMaterialSubjectBinding.count({where:{experimentId:scope.id,participantKey}}),0)
 const lock='TRAINING_MATERIAL_KEEP_LINKED_V1:'+canonicalHash({experimentId:scope.id,participantKey})
 const responses=await collide(null,[p1,p2].map(p=>()=>actor.client.request(`${prefix}/${p.id}/attempts`,'POST',{})),'first_binding_subject',lock)
 const assignments=await Promise.all(responses.map(async r=>(await candidateProof(r.attempt.id)).candidate.materialAssignment))
 assert.equal(assignments[0].groupKey,assignments[1].groupKey);assert.equal(assignments[0].experimentId,scope.id);assert.equal(assignments[1].experimentId,scope.id)
 assert.deepEqual(assignments.map(a=>a.algorithm).sort(),['CRYPTO_RANDOM_INT_V1','LINKED_INHERIT_V1'])
 const initial=assignments.find(a=>a.algorithm==='CRYPTO_RANDOM_INT_V1'),inherited=assignments.find(a=>a.algorithm==='LINKED_INHERIT_V1')
 const bindings=await prisma.trainingMaterialSubjectBinding.findMany({where:{experimentId:scope.id,participantKey}});assert.equal(bindings.length,1);assert.equal(bindings[0].initialClaimId,initial.claimId);assert.equal(bindings[0].groupKey,initial.groupKey)
 assert.equal((await prisma.trainingMaterialAllocationClaim.findUniqueOrThrow({where:{id:inherited.claimId}})).inheritedFromClaimId,initial.claimId)
 assert.equal(await prisma.trainingMaterialAllocationClaim.count({where:{experimentId:scope.id,participantKey}}),2)
 assert.equal(await prisma.trainingMaterialQuotaBucket.count({where:{compositeId:{in:[p1.id,p2.id]}}}),0)
 h.result.measurements.push({label:'KEEP_LINKED_FIRST_BINDING',publications:[p1.id,p2.id],participantKey,experimentId:scope.id,claims:assignments.map(a=>({claimId:a.claimId,groupKey:a.groupKey,algorithm:a.algorithm})),bindings:1})
 h.check('Two distinct publications and two actual advisory-lock waiters serialize first KEEP_LINKED binding: one random claim, one inherited claim, one subject binding, no quota')
 h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
