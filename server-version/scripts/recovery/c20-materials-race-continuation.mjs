/** Exact state03 race continuation; accepted quota/restart races are never replayed. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {harness,drainReports,prisma,PrismaClient,children,candidateProof,noWrites,denied,sha,require,backend,prefix,pub,pause,products} from './c20-materials-client.mjs'
import {logins,participant,formMaterialProduct,form,formRows,unitKey,publish,formBody,expiry} from './c20-materials-fixture.mjs'
const {canonicalHash}=require(path.join(backend,'dist/modules/assessment-runtime/canonical.js'))
const {trainingFlowSchema}=require(path.join(backend,'dist/modules/questionnaire-product/training-flow-authoring.js'))
const {parseTrainingFlowDraft}=require(path.join(backend,'dist/modules/assessment-core/flow/training.js'))
const h=harness('race');let error
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
 assert.equal(sha(fs.readFileSync(priorFile)),'f77ff1916c4ed6e039a3699efc002bee71ca3e842c62e33e3f9ce1e68d546678')
 assert.equal(prior.passed,false);assert.equal(prior.checks.length,1);assert.deepEqual(prior.measurements.map(m=>m.label),['last_quota','same_restart']);assert.ok(prior.measurements.every(m=>m.actualPgWaiters.length===2))
 assert.equal(prior.requests.at(-1).route,'/composite-assessments/8c9d402b-e411-48b9-acad-666d1bdc6cde/public-tokens');assert.equal(prior.requests.at(-1).status,400)
 const f=h.read('c20-fixture-private.json');assert.equal(sha(fs.readFileSync(path.join(h.state,'c20-fixture-private.json'))),'fd9fbe5a8ba6bbdc24a9674760061c3ff86c24bae809161dc1daaaabdb83e646')
 const {teacher}=await logins(h,f)
 h.result.priorProducer={resultSha256:'f77ff1916c4ed6e039a3699efc002bee71ca3e842c62e33e3f9ce1e68d546678',runtimeSha256:'30c286a84a9e40e9aa29a3707c29b77729f058a2286ef71b2725b8e048cc994f',reusedChecks:prior.checks,continuation:'Preserve the accepted last-quota and double-restart races. Reuse the exact published null-flow product; fill its missing lock-order race plus null/V1 restart and new KEEP_LINKED first-binding concurrency.'}
 const legacy=await teacher.request(`${products}/8c9d402b-e411-48b9-acad-666d1bdc6cde`)
 assert.equal(legacy.status,'PUBLISHED');assert.equal(legacy.trainingFlowFrozen,null);assert.equal(legacy.name,'C20 legacy lock-order regression')
 const legacyRow=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:legacy.id}});assert.equal(legacyRow.createdBy,f.users.teacher.id)
 assert.equal(await prisma.compositeAssessmentAttempt.count({where:{compositeAssessmentId:legacy.id}}),0)
 assert.equal(await prisma.compositeAssessmentAccessToken.count({where:{compositeAssessmentId:legacy.id}}),0)
 const lt=await teacher.request(`${prefix}/${legacy.id}/public-tokens`,'POST',{expiresAt:boundedTokenExpiry(legacyRow),maxUses:2}),lc=h.client(),newcomer=h.client();await lc.request('/auth/csrf');await newcomer.request('/auth/csrf')
 const original=await lc.request(`${pub}/${lt.token}/start`,'POST',{});lc.recovery=original.recoveryToken
 assert.equal((await lc.request(`${pub}/${lt.token}/start`,'POST',{recoveryToken:original.recoveryToken})).attempt.id,original.attempt.id)
 const before=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:original.attempt.id}})
 const joint=await collide(legacy.id,[()=>lc.request(`${pub}/attempts/${original.attempt.id}/restart`,'POST',{}),()=>newcomer.request(`${pub}/${lt.token}/start`,'POST',{})],'legacy_start_restart')
 assert.ok(joint.every(r=>r.attempt));assert.equal(await prisma.compositeAssessmentAttempt.count({where:{compositeAssessmentId:legacy.id}}),3)
 await assertRotated('null',legacy,lc,original,joint[0],before,lt,2)
 h.check('Null-flow start/restart share definition lock order: two observed PG waiters, no deadlock, exactly three parents/two token uses')
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
