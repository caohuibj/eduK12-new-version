/** PostgreSQL observed dual waiters; serialized requests alone cannot pass. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {harness,prisma,PrismaClient,children,candidateProof,prefix,pub,pause,products} from './c20-materials-client.mjs'
import {logins,participant,formMaterialProduct,form,expiry} from './c20-materials-fixture.mjs'
const h=harness('race');let error
async function collide(productId,operations,label){
 const u=new URL(process.env.DATABASE_URL);u.searchParams.set('connection_limit','1');u.searchParams.set('application_name','c20_'+label)
 const gate=new PrismaClient({datasources:{db:{url:u.toString()}}});let release,arrive,reject;const hold=new Promise(r=>release=r),ready=new Promise((r,j)=>{arrive=r;reject=j});let pending=[]
 const held=gate.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM composite_assessments WHERE id=$1 FOR UPDATE',productId);const [{pid}]=await tx.$queryRawUnsafe('SELECT pg_backend_pid()::int pid');arrive(pid);await hold},{timeout:30000,maxWait:10000});held.catch(reject)
 try{
  const pid=await ready;pending=operations.map(fn=>{const r={settled:false};r.promise=fn().then(v=>{r.value=v;r.settled=true},e=>{r.error=e;r.settled=true});return r});let waiters=[]
  const end=Date.now()+8000;while(Date.now()<end){assert.ok(pending.every(r=>!r.settled),'request escaped held definition lock');const rows=await prisma.$queryRawUnsafe("SELECT pid::int pid,pg_blocking_pids(pid)::int[] blockers FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND wait_event_type='Lock' AND pid<>pg_backend_pid()");waiters=rows.filter(r=>r.blockers.includes(pid)||r.blockers.some(b=>rows.some(q=>q.pid===b&&q.blockers.includes(pid))));if(waiters.length===2)break;await pause(20)}
  assert.equal(waiters.length,2,'two actual PostgreSQL blocked writers required');release();await held;await Promise.all(pending.map(r=>r.promise));for(const r of pending)if(r.error)throw r.error;h.result.measurements.push({label,actualPgWaiters:waiters});return pending.map(r=>r.value)
 }finally{release();await held;await Promise.allSettled(pending.map(r=>r.promise));await gate.$disconnect()}
}
try{
 const f=h.read('c20-fixture-private.json'),{teacher}=await logins(h,f),product=await formMaterialProduct(teacher,f,{linkedPolicy:'RERANDOMIZE'}),seed=await participant(h,f,'quota_seed');await seed.client.request(`${prefix}/${product.id}/attempts`,'POST',{})
 const actors=[await participant(h,f,'quota_race_a'),await participant(h,f,'quota_race_b')]
 const before={parents:await prisma.compositeAssessmentAttempt.count({where:{compositeAssessmentId:product.id}}),claims:await prisma.trainingMaterialAllocationClaim.count({where:{compositeId:product.id}})}
 const responses=await collide(product.id,actors.map(a=>()=>a.client.request(`${prefix}/${product.id}/attempts`,'POST',{},[200,409])),'last_quota')
 assert.equal(responses.filter(r=>r.attempt).length,1);assert.equal(responses.filter(r=>!r.attempt).length,1)
 assert.equal(await prisma.compositeAssessmentAttempt.count({where:{compositeAssessmentId:product.id}}),before.parents+1);assert.equal(await prisma.trainingMaterialAllocationClaim.count({where:{compositeId:product.id}}),before.claims+1)
 const buckets=await prisma.trainingMaterialQuotaBucket.findMany({where:{compositeId:product.id}});assert.deepEqual(buckets.map(b=>b.assignedCount),[1,1])
 const winner=responses.find(r=>r.attempt).attempt;assert.equal((await children(winner.id)).forms.length,1)
 const rp=await formMaterialProduct(teacher,f,{linkedPolicy:'RERANDOMIZE',limits:{a:10,b:10}}),token=await teacher.request(`${prefix}/${rp.id}/public-tokens`,'POST',{expiresAt:new Date(Date.now()+1800000).toISOString(),maxUses:1}),client=h.client();await client.request('/auth/csrf');const first=await client.request(`${pub}/${token.token}/start`,'POST',{});client.recovery=first.recoveryToken
 const claim=(await candidateProof(first.attempt.id)).candidate.materialAssignment,quota=await prisma.trainingMaterialQuotaBucket.findMany({where:{compositeId:rp.id},orderBy:{id:'asc'}})
 const replies=await collide(rp.id,[0,1].map(()=>()=>client.request(`${pub}/attempts/${first.attempt.id}/restart`,'POST',{},[200,403,409])),'same_restart')
 assert.equal(replies.filter(r=>r.attempt).length,1);assert.equal(await prisma.compositeAssessmentAttempt.count({where:{compositeAssessmentId:rp.id}}),2);assert.equal(await prisma.trainingMaterialAllocationClaim.count({where:{compositeId:rp.id}}),1)
 const next=replies.find(r=>r.attempt);assert.equal((await candidateProof(next.attempt.id)).candidate.materialAssignment.claimId,claim.claimId);assert.equal((await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:first.attempt.id}})).recoveryTokenHash,null)
 assert.deepEqual(await prisma.trainingMaterialQuotaBucket.findMany({where:{compositeId:rp.id},orderBy:{id:'asc'}}),quota);assert.equal((await prisma.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:token.id}})).usedCount,1)
 h.check('Last quota dual PostgreSQL waiters commit one parent/claim/first native only; dual restart creates one replacement and preserves claim/quota/token count')
 // Legacy null-flow publication: start and restart must share lock order too.
 let legacy=await teacher.request(products,'POST',{requestId:randomUUID(),name:'C20 legacy lock-order regression',questionnaireType:'COURSE',courseIds:[f.courseId],publicEnabled:true,expiresAt:expiry()})
 legacy=await teacher.request(`${products}/${legacy.id}/items`,'POST',{revision:legacy.revision,item:form('route')})
 const flight=await teacher.request(`${products}/${legacy.id}/preflight`,'POST',{revision:legacy.revision});assert.equal(flight.ok,true)
 legacy=await teacher.request(`${products}/${legacy.id}/publish`,'POST',{revision:legacy.revision});assert.equal(legacy.trainingFlowFrozen,null)
 const lt=await teacher.request(`${prefix}/${legacy.id}/public-tokens`,'POST',{expiresAt:expiry(),maxUses:2}),lc=h.client(),newcomer=h.client();await lc.request('/auth/csrf');await newcomer.request('/auth/csrf')
 const original=await lc.request(`${pub}/${lt.token}/start`,'POST',{});lc.recovery=original.recoveryToken
 const joint=await collide(legacy.id,[()=>lc.request(`${pub}/attempts/${original.attempt.id}/restart`,'POST',{}),()=>newcomer.request(`${pub}/${lt.token}/start`,'POST',{})],'legacy_start_restart')
 assert.ok(joint.every(r=>r.attempt));assert.equal(await prisma.compositeAssessmentAttempt.count({where:{compositeAssessmentId:legacy.id}}),3)
 assert.equal((await prisma.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:lt.id}})).usedCount,2)
 assert.equal(await prisma.trainingMaterialAllocationClaim.count({where:{compositeId:legacy.id}}),0)
 assert.equal((await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:original.attempt.id}})).status,'ABANDONED')
 h.check('Null-flow public start and restart both block behind the same definition barrier, then finish without deadlock; token uses=2, parent attempts=3, material claims=0')
 h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
