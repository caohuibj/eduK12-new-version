/** C19 real PostgreSQL parent-row contention; no mocked lock or direct FINAL. */
import assert from 'node:assert/strict'
import {harness,drainReports,prisma,PrismaClient,children,candidateProof,noWrites,readCognitiveQuota,prefix,pause} from './c19-flow-client.mjs'
import {participant,formBody} from './c19-flow-fixture.mjs'
const h=harness('race');let error,gate
try{
 const fixture=h.read('c19-fixture-private.json'),actor=await participant(h,fixture,'race'),product=fixture.product
 const {attempt}=await actor.client.request(`${prefix}/${product.id}/attempts`,'POST',{})
 const initial=await candidateProof(attempt.id),body=formBody(attempt,'screen'),route=`${prefix}/attempts/${attempt.id}/form-sections/${attempt.currentItem.id}/submit`
 const url=new URL(process.env.DATABASE_URL);url.searchParams.set('connection_limit','1');url.searchParams.set('application_name','c19_parent_final_gate')
 gate=new PrismaClient({datasources:{db:{url:url.toString()}}})
 let arrived,release,rejectReady;const ready=new Promise((r,j)=>{arrived=r;rejectReady=j}),hold=new Promise(r=>release=r)
 const held=gate.$transaction(async tx=>{const [{pid}]=await tx.$queryRawUnsafe('SELECT pg_backend_pid()::int AS pid');await tx.$queryRawUnsafe('SELECT id FROM composite_assessment_attempts WHERE id=$1 FOR UPDATE',attempt.id);arrived(pid);await hold},{maxWait:10000,timeout:30000});held.catch(rejectReady)
 const requests=[];let blockers=[]
 try{
  const blocker=await ready
  for(let i=0;i<2;i++){const tracked={settled:false};tracked.promise=actor.client.request(route,'POST',body).then(value=>{tracked.settled=true;tracked.value=value},cause=>{tracked.settled=true;tracked.error=cause});requests.push(tracked)}
  const until=Date.now()+8000
  while(Date.now()<until){
   assert.ok(requests.every(r=>!r.settled),'FINAL completed before the required parent lock contention')
   const rows=await prisma.$queryRawUnsafe("SELECT pid::int AS pid,wait_event AS event,pg_blocking_pids(pid)::int[] AS blockers FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND wait_event_type='Lock' AND query ILIKE '%composite_assessment_attempts%' AND pid<>pg_backend_pid()")
   const relevant=rows.filter(row=>row.blockers.includes(blocker)||row.blockers.some(pid=>rows.some(other=>other.pid===pid&&other.blockers.includes(blocker))))
   if(relevant.length===2){blockers=relevant;break}await pause(20)
  }
  assert.equal(blockers.length,2,'two real PostgreSQL waiters required');release();await held
  await Promise.all(requests.map(r=>r.promise));for(const request of requests)if(request.error)throw request.error;const outcomes=requests.map(r=>r.value);assert.equal(outcomes.filter(value=>value.replayed===true).length,1)
 }finally{release();await held;await Promise.allSettled(requests.map(r=>r.promise));await gate.$disconnect();gate=null}
 const completed=await actor.client.request(`${prefix}/attempts/${attempt.id}`),proof=await candidateProof(attempt.id),child=await children(attempt.id)
 assert.equal(completed.status,'COMPLETED');assert.equal(proof.row.taskSatisfaction,'NOT_SATISFIED');assert.equal(proof.proof.path.termination,'SCREEN_OUT');assert.equal(proof.proof.path.acceptedFacts.length,1)
 assert.deepEqual(proof.stable,initial.stable);assert.deepEqual([child.forms.length,child.scales.length,child.cognitive.length,child.sjt.length,child.snapshots.length,child.jobs.length],[1,0,0,0,1,1])
 assert.equal(child.forms[0].submissionId,body.submissionId);assert.equal(child.snapshots[0].sourceSubmissionId,body.submissionId)
 assert.equal(child.jobs[0].requestedRevision,1);assert.equal(child.jobs[0].attemptCount,0);assert.equal((await readCognitiveQuota(prisma,actor.user.id,fixture.assignmentId)).usedAttempts,0)
 const stable={pathHash:proof.row.trainingFlowPathHash,pathEncrypted:proof.row.trainingFlowPathEncrypted,form:child.forms[0],snapshots:child.snapshots,jobs:child.jobs}
 await noWrites(h,'Post-race exact replay does not create another outbox/path/fact',()=>actor.client.request(route,'POST',body))
 const after=await children(attempt.id),parent=await candidateProof(attempt.id);assert.deepEqual({pathHash:parent.row.trainingFlowPathHash,pathEncrypted:parent.row.trainingFlowPathEncrypted,form:after.forms[0],snapshots:after.snapshots,jobs:after.jobs},stable)
 fixture.cases.push({name:'race_screen',attemptId:attempt.id,user:actor.user,productId:product.id,termination:'SCREEN_OUT',satisfaction:'NOT_SATISFIED',candidate:proof.stable});h.write('c19-fixture-private.json',fixture)
 h.result.race={actualPgWaiters:blockers,acceptedSubmissionId:body.submissionId,replayedRequests:1,snapshots:1,outboxJobs:1,requestedRevision:1,pathHash:proof.row.trainingFlowPathHash,candidateBytes:proof.stable.candidateBytes,quotaUsed:0}
 h.check('Two observed PostgreSQL parent-row FINAL waiters linearize to one accepted Form, one exact replay, one path proof and one outbox revision; SCREEN_OUT does not admit native children or charge quota')
 await drainReports(h,[attempt.id])
 h.result.passed=true
}catch(e){error=e;throw e}finally{if(gate)await gate.$disconnect();await h.finish(error)}
