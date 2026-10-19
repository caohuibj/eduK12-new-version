/** Real HTTP/production-service races under observed PostgreSQL lock graphs.
 * Direct SQL is restricted to NEW synthetic fixtures and guard probes.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {harness,prisma,require,backend,pub,pause,sha,drainReports} from './c23-checkpoint-client.mjs'
import {publicPostgresFailure} from './c21-error-redaction.mjs'
import {pathsToGate,descendants} from './c23-checkpoint-barrier.mjs'
import {completeTerminalCheckpoint} from './c23-checkpoint-terminal.mjs'
import {actors,anonymous,envelope,checkpoint,save,clear,read,row,retain,expire,product} from './c23-checkpoint-fixture.mjs'
import {formBody} from './c20-materials-fixture.mjs'
const h=harness('races'),f=h.read('c23-fixture-private.json'),connections=new Set(),{Client}=require('pg')
const {cleanupExpiredTrainingCheckpoints}=require(path.join(backend,'dist/modules/composite/training-checkpoint.service.js'))
let observer,error
const q=(c,text,values=[])=>c.query(text,values)
function privateLog(name,value){fs.appendFileSync(path.join(h.state,'c23-races-'+name+'-private.jsonl'),JSON.stringify({at:new Date().toISOString(),...value})+'\n',{mode:0o600,flush:true})}
function failure(e){privateLog('errors',{name:e.name,code:e.code,message:e.message,detail:e.detail,where:e.where,stack:e.stack});return publicPostgresFailure(e)}
async function connect(name){const u=new URL(process.env.DATABASE_URL);u.searchParams.delete('connection_limit');u.searchParams.delete('pool_timeout');u.searchParams.set('application_name','c23_'+name);const c=new Client({connectionString:u.toString()});await c.connect();connections.add(c);await q(c,"SET statement_timeout='5000ms'");c.pid=(await q(c,'SELECT pg_backend_pid()::int pid')).rows[0].pid;return c}
async function close(c){if(!c)return;await c.end();connections.delete(c)}
async function rollback(c){await q(c,'ROLLBACK').catch(()=>{})}
function tracked(fn){const t={settled:false};t.promise=Promise.resolve().then(fn).then(value=>{t.settled=true;t.value=value;return value},e=>{t.settled=true;t.error=e;throw e});t.promise.catch(()=>{});return t}
async function barrier(gate,operations,label){
 const deadline=performance.now()+350
 while(performance.now()<deadline){
  const pendingBefore=operations.every(t=>!t.settled)
  const graph=(await q(observer,"SELECT pid::int,pg_blocking_pids(pid)::int[] blockers,wait_event_type,wait_event,state FROM pg_stat_activity WHERE datname=current_database() ORDER BY pid")).rows
  const waiters=descendants(graph,gate.pid),paths=pathsToGate(graph,gate.pid,waiters),pendingAfter=operations.every(t=>!t.settled)
  const evidence={case:label,gatePid:gate.pid,waiterPids:waiters,pendingBefore,pendingAfter,graph:graph.filter(r=>r.pid===gate.pid||waiters.includes(r.pid)),paths}
  privateLog('barrier',evidence)
  assert.ok(pendingBefore&&pendingAfter,'operation settled before the required real PostgreSQL barrier')
  if(waiters.length===operations.length&&paths)return evidence
  await pause(5) // Bounded observation polling only. Success always requires a PG wait graph.
 }
 throw new Error('No required PostgreSQL wait graph before the production 500ms lock budget')
}
async function gated(x,label,operations,table='composite_assessment_attempts'){
 assert.ok(['composite_assessment_attempts','training_attempt_checkpoints'].includes(table))
 const gate=await connect('gate'),before=h.result.requests.length
 let tasks=[]
 try{
  await q(gate,'BEGIN');await q(gate,`SELECT ${table==='training_attempt_checkpoints'?'attempt_id':'id'} FROM ${table} WHERE ${table==='training_attempt_checkpoints'?'attempt_id':'id'}=$1 FOR UPDATE`,[x.attempt.id])
  tasks=operations.map(tracked);const observed=await barrier(gate,tasks,label)
  await q(gate,'COMMIT');const values=await Promise.all(tasks.map(t=>t.promise))
  const requests=h.result.requests.slice(before).filter(r=>!r.route.startsWith('/auth/'))
  h.result.measurements.push({case:label,barrier:observed,outcomes:requests.map(r=>({method:r.method,status:r.status,route:r.route})),completed:true})
  return {values,requests}
 }finally{await rollback(gate);await Promise.allSettled(tasks.map(t=>t.promise));await close(gate)}
}
async function reject(label,sql,values,pattern){
 const c=await connect('guard');let rejected
 try{await q(c,'BEGIN');try{await q(c,sql,values)}catch(e){rejected=e;failure(e)}assert.ok(rejected,'guard unexpectedly accepted '+label);assert.match(rejected.message,pattern);assert.equal(rejected.code,'P0001')}
 finally{await rollback(c);await close(c)}
 h.result.measurements.push({case:label,rejected:true,code:rejected.code})
}
try{
 assert.equal(process.env.ASSESSMENT_REPORT_ASYNC_ENABLED,'true');assert.equal(process.env.BACKGROUND_WORKERS_ENABLED,'false')
 const phaseBaseline={queue:await prisma.compositeReportQueueBudget.findUnique({where:{id:'reports'}}),otherJobs:await prisma.compositeReportJob.findMany({orderBy:{id:'asc'}})}
 privateLog('terminal',{stage:'phase-baseline',rows:phaseBaseline});assert.ok(phaseBaseline.queue,'phase queue singleton must exist')
 observer=await connect('observer');const {teacher}=await actors(h,f),p=await teacher.request('/questionnaire-products/'+f.productId)
 const newCase=async name=>retain(f,name,await anonymous(h,teacher,p))
 const cas=await newCase('race-save-save'),cenv=await envelope(cas)
 const doubled=await gated(cas,'concurrent-save-save',[()=>save(cas,cenv,0,[200,409]),()=>save(cas,cenv,0,[200,409])])
 assert.deepEqual(doubled.requests.map(r=>r.status).sort(),[200,409]);assert.equal((await row(cas)).successfulSaveCount,1);assert.equal((await row(cas)).revision,1)
 const mixed=await newCase('race-save-clear'),menv=await envelope(mixed);await save(mixed,menv,0)
 const saveClear=await gated(mixed,'concurrent-save-clear',[()=>save(mixed,menv,1,[200,409]),()=>clear(mixed,1,[200,409])])
 assert.deepEqual(saveClear.requests.map(r=>r.status).sort(),[200,409]);assert.equal((await row(mixed)).revision,2)
 h.check('Real PostgreSQL-blocked concurrent save/save and save/clear each accept exactly one CAS writer')
 const expired=await newCase('race-expiry-save'),eenv=await envelope(expired);await save(expired,eenv,0);const due=await expire(expired)
 const expirySave=await gated(expired,'expiry-read-vs-save',[()=>read(expired),()=>save(expired,eenv,due.revision,409)])
 assert.deepEqual(expirySave.requests.map(r=>r.status).sort(),[200,409]);assert.equal((await row(expired)).payloadEncrypted,null);assert.equal((await row(expired)).successfulSaveCount,1);assert.equal((await row(expired)).revision,due.revision+1)
 h.check('Expiry read versus stale save commits erasure exactly once and preserves cumulative save count')
 const maintenance=await newCase('race-maintenance-skip-locked'),maintEnv=await envelope(maintenance);await save(maintenance,maintEnv,0);const maintDue=await expire(maintenance)
 const gate=await connect('maintenance_gate');let pending
 try{
  await q(gate,'BEGIN');await q(gate,'SELECT attempt_id FROM training_attempt_checkpoints WHERE attempt_id=$1 FOR UPDATE',[maintenance.attempt.id])
  pending=tracked(()=>save(maintenance,maintEnv,maintDue.revision,409));const observed=await barrier(gate,[pending],'maintenance-skip-locked-vs-save')
  assert.equal(await cleanupExpiredTrainingCheckpoints(),0,'production SKIP LOCKED must skip the held due row without waiting on the parent')
  await q(gate,'COMMIT');await pending.promise
  const after=await row(maintenance);assert.equal(after.payloadEncrypted,null);assert.equal(after.revision,maintDue.revision+1);assert.equal(after.successfulSaveCount,1)
  h.result.measurements.push({case:'maintenance-skip-locked-vs-save',barrier:observed,maintenanceChanged:0,saveStatus:409})
 }finally{await rollback(gate);if(pending)await Promise.allSettled([pending.promise]);await close(gate)}
 h.check('Held real checkpoint row blocks expiry-save while production maintenance skips it without parent-lock deadlock')
 const child=await newCase('race-child-final'),drafts=await envelope(child);assert.equal(drafts.drafts.length,2)
 await save(child,drafts,0)
 const finalBody=formBody(child.attempt,'yes'),finalRoute=`${pub}/attempts/${child.attempt.id}/form-sections/${child.attempt.currentItem.id}/submit`
 const raced=await gated(child,'child-final-vs-checkpoint',[()=>child.client.request(finalRoute,'POST',finalBody),()=>save(child,drafts,1,[200,409])])
 assert.equal(raced.requests.find(r=>r.route===finalRoute).status,200)
 const accepted=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:child.attempt.id}});assert.equal(accepted.length,1)
 const projected=await read(child),retained=await row(child)
 assert.equal(projected.envelope.drafts.length,1);assert.ok(!projected.envelope.drafts.some(d=>d.slotKey===accepted[0].slotKey));assert.deepEqual(projected.discardedTerminalSlotKeys,[accepted[0].slotKey]);assert.ok(retained.payloadEncrypted);assert.ok(retained.revision>=2)
 await save(child,drafts,1,409)
 h.check('Real HTTP child FINAL versus checkpoint bumps CAS and projects accepted slot away while retaining the other draft')
 // Child FINAL is asynchronous here; a 200/null-parent response is not parent completion.
 const next=await child.client.request(`${pub}/attempts/${child.attempt.id}`);assert.equal(next.status,'IN_PROGRESS')
 await child.client.request(`${pub}/attempts/${child.attempt.id}/form-sections/${next.currentItem.id}/submit`,'POST',formBody(next,'yes'))
 const readTerminalFacts=async()=>({
  parent:await prisma.compositeAssessmentAttempt.findUnique({where:{id:child.attempt.id}}),
  job:await prisma.compositeReportJob.findUnique({where:{attemptId_attemptEpoch:{attemptId:child.attempt.id,attemptEpoch:child.attempt.attemptEpoch}}}),
  snapshots:await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:child.attempt.id},orderBy:{slotKey:'asc'}}),
  queue:await prisma.compositeReportQueueBudget.findUnique({where:{id:'reports'}}),checkpoint:await prisma.trainingAttemptCheckpoint.findUnique({where:{attemptId:child.attempt.id}}),
  otherJobs:await prisma.compositeReportJob.findMany({where:{attemptId:{not:child.attempt.id}},orderBy:{id:'asc'}}),
 })
 const terminalProof=await completeTerminalCheckpoint({attemptId:child.attempt.id,attemptEpoch:child.attempt.attemptEpoch,slotKeys:drafts.drafts.map(d=>d.slotKey),baseline:phaseBaseline,
  readFacts:readTerminalFacts,record:(stage,rows)=>privateLog('terminal',{stage,rows}),drain:attemptIds=>drainReports(h,attemptIds)})
 h.result.measurements.push(terminalProof)
 await child.client.request(checkpoint(child),'GET',undefined,409)
 const abandoned=await newCase('parent-abandoned-cleanup');await save(abandoned,await envelope(abandoned),0)
 await prisma.compositeAssessmentAttempt.update({where:{id:abandoned.attempt.id},data:{status:'ABANDONED'}})
 assert.equal((await row(abandoned)).payloadEncrypted,null);assert.equal((await row(abandoned)).successfulSaveCount,1)
 h.check('Actual parent FINAL and guarded synthetic abandonment erase payload in the status transaction, retaining identity and budget')
 const guardCase=await newCase('immutable-retention'),genv=await envelope(guardCase);await save(guardCase,genv,0)
 const guardBefore=await row(guardCase),id=guardCase.attempt.id
 const originalGuardDigest=sha(JSON.stringify(guardBefore))
 for(const [label,sql,values,pattern] of [
  ['checkpoint-delete','DELETE FROM training_attempt_checkpoints WHERE attempt_id=$1',[id],/identity and save budget are retained/],
  ['checkpoint-reset-budget','UPDATE training_attempt_checkpoints SET successful_save_count=0,revision=revision+1 WHERE attempt_id=$1',[id],/cumulative budget violation/],
  ['checkpoint-skip-revision','UPDATE training_attempt_checkpoints SET revision=revision+2 WHERE attempt_id=$1',[id],/cumulative budget violation/],
  ['checkpoint-change-definition','UPDATE training_attempt_checkpoints SET definition_hash=$2,revision=revision+1 WHERE attempt_id=$1',[id,'0'.repeat(64)],/cumulative budget violation/],
  ['checkpoint-change-round','UPDATE training_attempt_checkpoints SET round_id=$2,revision=revision+1 WHERE attempt_id=$1',[id,f.cases.find(c=>c.roundId).roundId],/cumulative budget violation/],
  ['checkpoint-extend-retention','UPDATE training_attempt_checkpoints SET expires_at=expires_at+interval \'1 hour\',revision=revision+1 WHERE attempt_id=$1',[id],/cumulative budget violation/],
  ['attempt-epoch-immutable','UPDATE composite_assessment_attempts SET attempt_epoch=attempt_epoch+1 WHERE id=$1',[id],/persistence identity requires a new attempt/],
  ['attempt-snapshot-immutable','UPDATE composite_assessment_attempts SET training_persistence_snapshot=NULL,training_persistence_snapshot_hash=NULL WHERE id=$1',[id],/snapshot is immutable/],
  ['published-policy-immutable','UPDATE composite_assessments SET training_persistence_policy=NULL,training_persistence_policy_hash=NULL WHERE id=$1',[f.productId],/persistence policy is immutable/],
 ])await reject(label,sql,values,pattern)
 assert.equal(sha(JSON.stringify(await row(guardCase))),originalGuardDigest)
 // Old historical-null upgrade rejection acts in a rolled-back transaction only.
 const legacy=f.cases.find(c=>c.name==='legacy-policy-off')
 await reject('historical-null-snapshot-upgrade','UPDATE composite_assessment_attempts SET training_persistence_snapshot=$2::jsonb,training_persistence_snapshot_hash=$3 WHERE id=$1',[legacy.attemptId,JSON.stringify((await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id}})).trainingPersistenceSnapshot),genv.snapshotHash],/snapshot is immutable/)
 h.check('Actual restricted-role retention/delete/budget/revision/identity/policy and historical-null upgrade guards reject atomically')
 h.write('c23-fixture-private.json',f);h.result.coverageLimitations=['No C21 IP-policy replay or capacity/load claim. All races involve new synthetic attempts in the disposable clone.','Guarded expiry shortening uses PostgreSQL server time on new fixture rows; wall clock and policy are never mocked.'];h.result.passed=true
}catch(e){error=e;throw e}finally{for(const c of [...connections]){await rollback(c);await close(c)}await h.finish(error)}
