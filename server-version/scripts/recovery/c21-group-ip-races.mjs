import {publicPostgresFailure} from './c21-error-redaction.mjs'
/** C21 real PostgreSQL barriers. Run only inside the isolated C21 launcher.
 * argv[2] is the private state directory. No trigger disabling, old-row changes,
 * owner fallback, service startup, or time manipulation. Fixtures are new rows.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID,randomBytes,createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {harness,require,backend,pause} from './c21-group-ip-client.mjs'
const {Client}=require('pg')
const {canonicalHash}=require(path.join(backend,'dist/modules/assessment-runtime/canonical.js'))
const {hashPublicAccessToken,encryptPublicAccessToken}=require(path.join(backend,'dist/services/publicAccessTokenCrypto.js'))
const retentionOnly=process.argv[3]==='--remaining-retention-guards'
const remainingOnly=retentionOnly||process.argv[3]==='--remaining-dual-guards'
const h=harness(retentionOnly?'races-retention':remainingOnly?'races-remainder':'races'),f=h.read('c21-fixture-private.json'),connections=new Set()
const uid=()=>`c21race_${randomUUID()}`
const digest=x=>createHash('sha256').update(x).digest('hex')
const failure=e=>{
 fs.appendFileSync(path.join(h.state,'c21-races-errors-private.jsonl'),JSON.stringify({at:new Date().toISOString(),name:e.name,code:e.code,message:e.message,detail:e.detail,where:e.where,stack:e.stack})+'\n',{mode:0o600})
 const result=publicPostgresFailure(e)
 // Assertion-only text is deliberately non-enumerable, so public JSON cannot carry it.
 Object.defineProperty(result,'message',{value:e.message,enumerable:false})
 return result
}
const q=(c,s,p=[])=>c.query(s,p)
let observer,error
async function connect(label){const u=new URL(process.env.DATABASE_URL);u.searchParams.delete('connection_limit');u.searchParams.delete('pool_timeout');u.searchParams.set('application_name',`c21_races_${label}`);const c=new Client({connectionString:u.toString()});await c.connect();connections.add(c);await q(c,"SET statement_timeout='15000ms'");c.pid=(await q(c,'SELECT pg_backend_pid()::int pid')).rows[0].pid;return c}
async function end(c){if(!c)return;await c.end();connections.delete(c)}
async function begin(c){await q(c,'BEGIN');await q(c,"SET LOCAL lock_timeout='12000ms'")}
async function rollback(c){await q(c,'ROLLBACK').catch(()=>{})}
function tracked(fn){const t={settled:false};t.promise=Promise.resolve().then(fn).then(v=>{t.settled=true;t.outcome={status:'committed',value:v};return t.outcome},e=>{t.settled=true;t.outcome={status:'aborted',error:failure(e)};return t.outcome});return t}
async function blocked(waiter,blocker,operation){const deadline=Date.now()+7000;while(Date.now()<deadline){const rows=(await q(observer,'SELECT pid::int,pg_blocking_pids(pid)::int[] blockers,wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1',[waiter.pid])).rows;if(rows[0]?.blockers.includes(blocker.pid))return {at:new Date().toISOString(),...rows[0]};assert.equal(operation.settled,false,`operation ${waiter.pid} completed before required blocking evidence: ${JSON.stringify(operation.outcome)}`);await pause(15)}throw new Error(`No pg_blocking_pids barrier ${waiter.pid} -> ${blocker.pid}`)}
function privateDiagnostic(value){fs.appendFileSync(path.join(h.state,'c21-races-diagnostics-private.jsonl'),JSON.stringify({at:new Date().toISOString(),...value})+'\n',{mode:0o600,flush:true})}
async function blockedDual(workers,gate,tasks,label){
 const pids=[gate.pid,...workers.map(c=>c.pid)],allowed=new Set(pids),deadline=Date.now()+7000
 assert.equal(allowed.size,3)
 while(Date.now()<deadline){
  const pendingBefore=tasks.map(t=>!t.settled)
  const graph=(await q(observer,'SELECT pid::int,pg_blocking_pids(pid)::int[] blockers,wait_event_type,wait_event,state FROM pg_stat_activity WHERE datname=current_database() AND pid=ANY($1::int[]) ORDER BY pid',[pids])).rows
  const pendingAfter=tasks.map(t=>!t.settled)
  const byPid=new Map(graph.map(row=>[row.pid,row]))
  function pathToGate(pid,seen=[]){
   if(!allowed.has(pid)||seen.includes(pid)||seen.length>2)return null
   if(pid===gate.pid)return [...seen,pid]
   const row=byPid.get(pid)
   if(!row||row.wait_event_type!=='Lock'||row.blockers.length===0||row.blockers.some(b=>b===0||!allowed.has(b)))return null
   for(const blocker of row.blockers){const path=pathToGate(blocker,[...seen,pid]);if(path)return path}
   return null
  }
  // Reject cyclic participant graphs, including a cycle beside an otherwise valid path.
  function cyclic(pid,seen=[]){if(seen.includes(pid))return true;return (byPid.get(pid)?.blockers??[]).filter(b=>allowed.has(b)).some(b=>cyclic(b,[...seen,pid]))}
  const paths=workers.map(c=>pathToGate(c.pid)),snapshot={case:label,stage:'barrier_poll',gatePid:gate.pid,workerPids:workers.map(c=>c.pid),pendingBefore,pendingAfter,graph,paths}
  privateDiagnostic(snapshot)
  assert.ok(pendingBefore.every(Boolean)&&pendingAfter.every(Boolean),'dual operation completed before required PostgreSQL barrier')
  if(graph.length===3&&graph.every(row=>row.blockers.every(b=>b!==0&&allowed.has(b)))&&!pids.some(pid=>cyclic(pid))&&paths.every(Boolean))return snapshot
  await pause(15)
 }
 throw new Error('No bounded PostgreSQL blocker paths from both pending workers to held gate; see private poll diagnostics')
}
function verifyPriorEvidence(){
 const prior=process.argv[4];assert.ok(prior,'remaining mode requires prior state directory')
 const receiptBytes=fs.readFileSync(path.join(prior,'c21-races-continuation-runtime-result.json')),raceBytes=fs.readFileSync(path.join(prior,'c21-races-result.json'))
 assert.equal(digest(receiptBytes),'08b2176c6da3435a75f0a165474de888f133d4aabc07895ca2df3283478bcfb0')
 assert.equal(digest(raceBytes),'ae5b42a40c1366f6c8bcf535190ae6d3474c9cfe035bc40951d034f9cd058e72')
 const previous=JSON.parse(raceBytes),expected=Object.keys(actions).flatMap(name=>['freeze_then_mutation','mutation_then_freeze'].map(order=>[name,order])).concat(['delivery_update','delivery_delete'].map(name=>[`${name}_row_parent_lock_cycle`,null]))
 assert.equal(previous.passed,false);assert.equal(previous.phase,'races');assert.equal(previous.checks.length,12);assert.equal(previous.counts.length,0);assert.equal(previous.requests.length,0)
 assert.deepEqual(previous.measurements.map(m=>[m.case,m.order??null]),expected)
 for(const key of ['migrationSha256','roundServiceSha256','compositeServiceSha256'])assert.equal(previous.source[key],h.result.source[key])
 assert.equal(digest(fs.readFileSync(path.join(prior,'c21-fixture-private.json'))),digest(fs.readFileSync(path.join(h.state,'c21-fixture-private.json'))))
 h.result.reusedEvidence={originalPassed:false,executedAgain:false,runtimeReceiptSha256:digest(receiptBytes),raceResultSha256:digest(raceBytes),source:previous.source,cases:expected.map(([name,order])=>({case:name,order})),acceptedMeasurementCount:12}
}
function verifyPriorRetentionEvidence(){
 const prior=process.argv[5];assert.ok(prior,'retention mode requires continuation03 state directory')
 const receiptBytes=fs.readFileSync(path.join(prior,'c21-final-continuation-runtime-result.json')),raceBytes=fs.readFileSync(path.join(prior,'c21-races-remainder-result.json'))
 assert.equal(digest(receiptBytes),'c7ef2bdf310cb0af77df8ebd64453eea42bd724fc2e70d7889fc59a46c9ed6b7')
 assert.equal(digest(raceBytes),'c98000c7b03ea5e264e2d0f91615fa805fd70969b686912b92fb24b311ac24a1')
 const previous=JSON.parse(raceBytes),expected=['concurrent_new_round_creation','concurrent_exact_round_reuse','round_window_immutable','round_delete_immutable','old_null_upgrade','round_token_detach','round_token_id_mutation','round_token_creator_mutation','round_token_encrypted_mutation','round_token_created_at_mutation','round_token_hash_mutation','round_token_expiry_extension','parent_publication_mutation']
 assert.equal(previous.passed,false);assert.equal(previous.phase,'races-remainder');assert.equal(previous.checks.length,13);assert.equal(previous.counts.length,0);assert.equal(previous.requests.length,0)
 assert.deepEqual(previous.measurements.map(m=>m.case),expected)
 for(const key of ['migrationSha256','roundServiceSha256','compositeServiceSha256'])assert.equal(previous.source[key],h.result.source[key])
 assert.equal(previous.reusedEvidence.raceResultSha256,h.result.reusedEvidence.raceResultSha256)
 assert.equal(digest(fs.readFileSync(path.join(prior,'c21-fixture-private.json'))),digest(fs.readFileSync(path.join(h.state,'c21-fixture-private.json'))))
 h.result.reusedRetentionEvidence={originalPassed:false,executedAgain:false,runtimeReceiptSha256:digest(receiptBytes),raceResultSha256:digest(raceBytes),source:previous.source,cases:expected,acceptedMeasurementCount:13,originalCourseTypeProbe:'FAILED_23514_PREEXISTING_REALM_GUARD_NOT_ACCEPTED_AS_C21'}
}
async function courseCreatorPositiveControl(){
 const x=await fixture(),candidate=f.users.otherTeacher.id
 const owner=(await q(observer,'SELECT creator_id FROM courses WHERE id=$1',[x.course])).rows[0].creator_id
 assert.notEqual(candidate,owner)
 const actor=(await q(observer,'SELECT role::text role,account_domain::text account_domain FROM users WHERE id=$1',[candidate])).rows[0]
 assert.deepEqual(actor,{role:'TEACHER',account_domain:'TRAINING'})
 assert.equal((await q(observer,'SELECT count(*)::int n FROM training_public_rounds WHERE course_id=$1',[x.course])).rows[0].n,0)
 assert.equal((await q(observer,'SELECT count(*)::int n FROM training_material_experiments WHERE course_id=$1',[x.course])).rows[0].n,0)
 await begin(observer)
 try{
  const changed=await q(observer,'UPDATE courses SET creator_id=$1 WHERE id=$2 RETURNING creator_id',[candidate,x.course])
  assert.equal(changed.rowCount,1);assert.equal(changed.rows[0].creator_id,candidate)
  assert.equal((await q(observer,'SELECT creator_id FROM courses WHERE id=$1',[x.course])).rows[0].creator_id,candidate)
 }finally{await rollback(observer)}
 assert.equal((await q(observer,'SELECT creator_id FROM courses WHERE id=$1',[x.course])).rows[0].creator_id,owner)
 privateDiagnostic({case:'course_creator_unbound_positive_control',stage:'rollback_verified',fixture:x,creatorBefore:owner,candidate,creatorAfter:owner})
 h.result.measurements.push({case:'course_creator_unbound_positive_control',transaction:{status:'rolled_back'},changedCount:1,readbackVerified:true,originalCreatorRestored:true})
 h.check('Fresh unbound Training course permits valid otherTeacher creator change; readback verified and rolled back')
}
let priorRows
async function retainPriorFixtureSnapshot(){
 const tables=['courses','composite_assessments','composite_assessment_access_tokens','training_public_rounds','anonymous_studies','anonymous_study_waves','composite_assessment_attempts'],snapshot={}
 for(const table of tables)snapshot[table]=(await q(observer,`SELECT id,to_jsonb(t) row FROM ${table} t WHERE starts_with(id,'c21race_') ORDER BY id`)).rows
 const parents=snapshot.composite_assessments.map(row=>row.id)
 snapshot.questionnaire_course_deliveries=(await q(observer,'SELECT to_jsonb(t) row FROM questionnaire_course_deliveries t WHERE composite_id=ANY($1::text[]) ORDER BY composite_id,course_id',[parents])).rows
 h.write('c21-prior-race-fixture-snapshot-private.json',snapshot);return snapshot
}
async function verifyPriorFixturesUnchanged(){
 const evidence=[]
 for(const [table,before] of Object.entries(priorRows)){
  const after=table==='questionnaire_course_deliveries'?(await q(observer,'SELECT to_jsonb(t) row FROM questionnaire_course_deliveries t WHERE composite_id=ANY($1::text[]) ORDER BY composite_id,course_id',[priorRows.composite_assessments.map(row=>row.id)])).rows:(await q(observer,`SELECT id,to_jsonb(t) row FROM ${table} t WHERE id=ANY($1::text[]) ORDER BY id`,[before.map(row=>row.id)])).rows
  assert.deepEqual(after,before,`previous synthetic ${table} rows must remain unchanged`)
  evidence.push({table,beforeCount:before.length,afterCount:after.length,beforeSha256:digest(JSON.stringify(before)),afterSha256:digest(JSON.stringify(after))})
 }
 h.result.priorFixturePreservation=evidence
}
async function clone(c,table,id,patch){assert.ok(['courses','composite_assessments'].includes(table));const r=await q(c,`INSERT INTO ${table} SELECT (jsonb_populate_record(NULL::${table},to_jsonb(s)||$2::jsonb)).* FROM ${table} s WHERE id=$1 RETURNING id`,[id,JSON.stringify(patch)]);assert.equal(r.rowCount,1);return r.rows[0].id}
async function fixture(){const course=uid(),otherCourse=uid(),parent=uid(),otherParent=uid(),token=uid(),study=uid();await begin(observer);try{for(const id of [course,otherCourse])await clone(observer,'courses',f.courseId,{id,course_code:uid(),ended_at:null});for(const id of [parent,otherParent])await clone(observer,'composite_assessments',f.productId,{id,code:uid(),name:'C21 isolated raw database race fixture',creation_key:null,creation_hash:null,course_id:null,opens_at:null,expires_at:null});await q(observer,'INSERT INTO questionnaire_course_deliveries(composite_id,course_id) VALUES($1,$2),($3,$4)',[parent,course,otherParent,otherCourse]);await tokenInsert(observer,{parent,token,round:null});await q(observer,"INSERT INTO anonymous_studies(id,owner_user_id,title) VALUES($1,$2,'C21 isolated valid study')",[study,f.users.teacher.id]);await q(observer,'COMMIT')}catch(e){await rollback(observer);throw e}return {parent,course,otherCourse,otherParent,token,study,round:uid(),newToken:uid()}}
async function tokenInsert(c,{parent,token=uid(),round=null}){
 // Match the existing protected-token contract; never persist or report plaintext.
 const rawToken=randomBytes(16).toString('hex')
 await q(c,`INSERT INTO composite_assessment_access_tokens(id,composite_assessment_id,token,token_hash,token_encrypted,created_by,expires_at,training_round_id) VALUES($1,$2,NULL,$3,$4,$5,CASE WHEN $6::text IS NULL THEN CURRENT_TIMESTAMP+interval '1 hour' ELSE (SELECT closes_at FROM training_public_rounds WHERE id=$6) END,$6)`,[token,parent,hashPublicAccessToken(rawToken),encryptPublicAccessToken(rawToken),f.users.teacher.id,round])
 return token
}
async function roundInsert(c,x,id=x.round,patch={}){const a=(await q(c,'SELECT * FROM composite_assessments WHERE id=$1',[x.parent])).rows[0];const now=new Date(),identity={schemaVersion:1,compositeId:x.parent,courseId:x.course,publishedAt:a.published_at.toISOString(),productKind:a.product_kind,questionnaireType:a.questionnaire_type,trainingFlowDigest:a.training_flow_digest??null,trainingVariantDigest:a.training_variant_digest??null};const data={id,composite_id:x.parent,course_id:x.course,created_by:f.users.teacher.id,published_at:a.published_at,publication_hash:canonicalHash(identity),publication_identity:identity,group_ip_policy:{schemaVersion:1,timeZone:'UTC',activationDate:now.toISOString().slice(0,10)},opens_at:now,closes_at:new Date(+now+3600000),created_at:now,...patch};await q(c,'INSERT INTO training_public_rounds SELECT (jsonb_populate_record(NULL::training_public_rounds,$1::jsonb)).*',[JSON.stringify(data)]);return id}
async function freeze(c,x){await q(c,'SELECT id FROM composite_assessments WHERE id=$1 FOR UPDATE',[x.parent]);await roundInsert(c,x);await tokenInsert(c,{parent:x.parent,token:x.newToken,round:x.round})}
async function counts(x){return (await q(observer,`SELECT (SELECT count(*)::int FROM training_public_rounds WHERE composite_id=$1) rounds,(SELECT count(*)::int FROM composite_assessment_access_tokens WHERE id=$2) new_tokens,(SELECT count(*)::int FROM questionnaire_course_deliveries WHERE composite_id=$1) deliveries,(SELECT count(*)::int FROM anonymous_study_waves WHERE study_id=$3) waves`,[x.parent,x.newToken,x.study])).rows[0]}
const actions={
 delivery_insert:(c,x)=>q(c,'INSERT INTO questionnaire_course_deliveries(composite_id,course_id) VALUES($1,$2)',[x.parent,x.otherCourse]),
 incoming_delivery_update:(c,x)=>q(c,'UPDATE questionnaire_course_deliveries SET composite_id=$1 WHERE composite_id=$2 AND course_id=$3',[x.parent,x.otherParent,x.otherCourse]),
 delivery_update:(c,x)=>q(c,'UPDATE questionnaire_course_deliveries SET course_id=$1 WHERE composite_id=$2 AND course_id=$3',[x.otherCourse,x.parent,x.course]),
 delivery_delete:(c,x)=>q(c,'DELETE FROM questionnaire_course_deliveries WHERE composite_id=$1 AND course_id=$2',[x.parent,x.course]),
 study_insert:(c,x)=>q(c,"INSERT INTO anonymous_study_waves(id,study_id,access_token_id,title,ordinal) VALUES($1,$2,$3,'C21 valid original study wave',1)",[uid(),x.study,x.token]),
}
async function ordered(name,freezeFirst){const x=await fixture(),a=await connect('first'),b=await connect('second');let pending;try{await begin(a);await (freezeFirst?freeze(a,x):actions[name](a,x));await begin(b);pending=tracked(async()=>{try{await (freezeFirst?actions[name](b,x):freeze(b,x));await q(b,'COMMIT')}catch(e){await rollback(b);throw e}});const evidence=await blocked(b,a,pending);await q(a,'COMMIT');const result=await pending.promise;assert.equal(result.status,'aborted','both incompatible transactions committed');assert.equal(result.error.code,'P0001','must fail actual C21 guard, not malformed fixture/FK/timeout');assert.match(result.error.message,freezeFirst?(name==='study_insert'?/does not compose with anonymous study/:/delivery binding is retained/):(name==='study_insert'?/does not compose with anonymous study/:/exact active published course questionnaire|course\/author mismatch/));const after=await counts(x);assert.equal(after.rounds,freezeFirst?1:0);assert.equal(after.new_tokens,freezeFirst?1:0);if(name==='study_insert')assert.equal(after.waves,freezeFirst?0:1);h.result.measurements.push({case:name,order:freezeFirst?'freeze_then_mutation':'mutation_then_freeze',blocking:evidence,transactions:[{status:'committed'},result],counts:after});h.check(`${name}: ${freezeFirst?'freeze':'mutation'} first, real PG block, incompatible second aborts atomically`)}finally{await rollback(a);if(pending)await pending.promise;await rollback(b);await end(a);await end(b)}}
async function rowLockCycle(name){const x=await fixture(),a=await connect('freeze_cycle'),b=await connect('delivery_cycle');let second,first;try{await begin(a);await q(a,'SELECT id FROM composite_assessments WHERE id=$1 FOR UPDATE',[x.parent]);await begin(b);second=tracked(async()=>{try{await actions[name](b,x);await q(b,'COMMIT')}catch(e){await rollback(b);throw e}});const evidence=await blocked(b,a,second);first=tracked(async()=>{try{await roundInsert(a,x);await tokenInsert(a,{parent:x.parent,token:x.newToken,round:x.round});await q(a,'COMMIT')}catch(e){await rollback(a);throw e}});const outcomes=await Promise.all([first.promise,second.promise]);assert.ok(outcomes.some(o=>o.status==='aborted'&&o.error.code==='40P01'),'original PostgreSQL deadlock must be recorded');assert.ok(outcomes.filter(o=>o.status==='committed').length<=1,'incompatible cycle must not both commit');for(const r of outcomes.filter(o=>o.status==='aborted'))assert.ok(['40P01','P0001'].includes(r.error.code),JSON.stringify(r));const after=await counts(x);assert.equal(after.rounds,outcomes[0].status==='committed'?1:0);assert.equal(after.new_tokens,after.rounds);h.result.measurements.push({case:`${name}_row_parent_lock_cycle`,blocking:evidence,transactions:outcomes,counts:after});h.check(`${name}: actual row→parent vs parent→row deadlock preserves SQLSTATE and atomic rollback`)}finally{await rollback(a);await rollback(b);await Promise.allSettled([first?.promise,second?.promise]);await end(a);await end(b)}}
async function dual(name,reuse){
 const x=await fixture();if(reuse)await roundInsert(observer,x)
 const gate=await connect('dual_gate'),cs=await Promise.all([connect('dual_a'),connect('dual_b')]);let tasks=[],accepted=false
 privateDiagnostic({case:name,stage:'fixture_before_dual',fixture:x,gatePid:gate.pid,workerPids:cs.map(c=>c.pid)})
 try{
  await begin(gate);await q(gate,reuse?'SELECT id FROM training_public_rounds WHERE id=$1 FOR UPDATE':'SELECT id FROM composite_assessments WHERE id=$1 FOR UPDATE',[reuse?x.round:x.parent])
  tasks=cs.map(c=>tracked(async()=>{await begin(c);try{const round=reuse?x.round:uid(),token=uid();privateDiagnostic({case:name,stage:'worker_targets',pid:c.pid,parent:x.parent,course:x.course,round,token});if(!reuse){await q(c,'SELECT id FROM composite_assessments WHERE id=$1 FOR UPDATE',[x.parent]);await roundInsert(c,x,round)}await tokenInsert(c,{parent:x.parent,token,round});await q(c,'COMMIT');return {token,round}}catch(e){await rollback(c);throw e}}))
  const evidence=await blockedDual(cs,gate,tasks,name);await q(gate,'COMMIT')
  const outcomes=await Promise.all(tasks.map(t=>t.promise));assert.ok(outcomes.every(o=>o.status==='committed'),JSON.stringify(outcomes))
  const rows=(await q(observer,`SELECT t.id,t.training_round_id,r.composite_id,r.course_id,r.publication_hash,t.expires_at<=r.closes_at bounded FROM composite_assessment_access_tokens t JOIN training_public_rounds r ON r.id=t.training_round_id WHERE t.id=ANY($1::text[])`,[outcomes.map(o=>o.value.token)])).rows
  assert.equal(rows.length,2);for(const row of rows){assert.equal(row.composite_id,x.parent);assert.equal(row.course_id,x.course);assert.equal(row.bounded,true);assert.equal(row.training_round_id,outcomes.find(o=>o.value.token===row.id).value.round)}
  assert.equal((await counts(x)).rounds,reuse?1:2);h.result.measurements.push({case:name,blocking:evidence,transactions:outcomes,bindings:rows,counts:await counts(x)});h.check(`${name}: dual blocked writers commit only exact bounded round bindings`);accepted=true
 }finally{
  await rollback(gate);const cleanup=await Promise.allSettled(tasks.map(t=>t.promise))
  privateDiagnostic({case:name,stage:'after_gate_release_and_cleanup',accepted,fixture:x,transactions:tasks.map(t=>t.outcome),settlement:cleanup,counts:await counts(x)})
  await end(gate);for(const c of cs)await end(c)
 }
}
async function reject(name,operation,pattern,codes=['P0001']){const before=(await q(observer,'SELECT count(*)::int n FROM training_public_rounds')).rows[0].n;await begin(observer);let original;try{await operation(observer)}catch(e){original=failure(e)}finally{await rollback(observer)}assert.ok(original,`${name} unexpectedly succeeded`);assert.ok(codes.includes(original.code),JSON.stringify(original));if(pattern)assert.match(original.message,pattern);assert.equal((await q(observer,'SELECT count(*)::int n FROM training_public_rounds')).rows[0].n,before);h.result.measurements.push({case:name,transaction:{status:'aborted',error:original},roundCountBefore:before,roundCountAfter:before});h.check(`${name}: rejected with original guard error`)}
try{
 observer=await connect('observer');const identity=(await q(observer,"SELECT current_user,version(),current_database(),(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) superuser")).rows[0];assert.equal(identity.current_user,'eduk12_runtime');assert.equal(identity.superuser,false);assert.match(identity.version,/PostgreSQL 16\.15\b/);h.result.database=identity;
 h.result.source={head:execFileSync('git',['rev-parse','HEAD'],{cwd:backend,encoding:'utf8'}).trim(),harnessSha256:digest(fs.readFileSync(fileURLToPath(import.meta.url))),migrationSha256:digest(fs.readFileSync(path.join(backend,'prisma/migrations/20261019040000_training_public_rounds/migration.sql'))),roundServiceSha256:digest(fs.readFileSync(path.join(backend,'src/modules/composite/training-public-round.ts'))),compositeServiceSha256:digest(fs.readFileSync(path.join(backend,'src/modules/composite/composite.service.ts')))};
 if(remainingOnly){verifyPriorEvidence();if(retentionOnly)verifyPriorRetentionEvidence();priorRows=await retainPriorFixtureSnapshot()}else{
  for(const name of Object.keys(actions))for(const order of [true,false])await ordered(name,order);
  for(const name of ['delivery_update','delivery_delete'])await rowLockCycle(name);
 }
 if(!retentionOnly){await dual('concurrent_new_round_creation',false);await dual('concurrent_exact_round_reuse',true)}
 await courseCreatorPositiveControl();
 const x=await fixture();await freeze(observer,x);
 if(!retentionOnly)for(const [name,sql,values] of [
  ['round_window_immutable','UPDATE training_public_rounds SET closes_at=closes_at+interval \'1 minute\' WHERE id=$1',[x.round]],
  ['round_delete_immutable','DELETE FROM training_public_rounds WHERE id=$1',[x.round]],
  ['old_null_upgrade','UPDATE composite_assessment_access_tokens SET training_round_id=$1 WHERE id=$2',[x.round,x.token]],
  ['round_token_detach','UPDATE composite_assessment_access_tokens SET training_round_id=NULL WHERE id=$1',[x.newToken]],
  ['round_token_id_mutation','UPDATE composite_assessment_access_tokens SET id=$1 WHERE id=$2',[uid(),x.newToken]],
  ['round_token_creator_mutation','UPDATE composite_assessment_access_tokens SET created_by=$1 WHERE id=$2',[f.users.admin.id,x.newToken]],
  ['round_token_encrypted_mutation','UPDATE composite_assessment_access_tokens SET token_encrypted=$1 WHERE id=$2',['c21-fault-only',x.newToken]],
  ['round_token_created_at_mutation',"UPDATE composite_assessment_access_tokens SET created_at=created_at+interval '1 second' WHERE id=$1",[x.newToken]],
  ['round_token_hash_mutation','UPDATE composite_assessment_access_tokens SET token_hash=$1 WHERE id=$2',[digest(uid()),x.newToken]],
  ['round_token_expiry_extension','UPDATE composite_assessment_access_tokens SET expires_at=expires_at+interval \'1 hour\' WHERE id=$1',[x.newToken]],
  ['parent_publication_mutation','UPDATE composite_assessments SET published_at=published_at+interval \'1 second\' WHERE id=$1',[x.parent]],
 ])await reject(name,c=>q(c,sql,values),/immutable|cannot change|bounded expiry|identity is retained/);
 assert.equal((await q(observer,'SELECT count(*)::int n FROM training_material_experiments WHERE course_id=$1',[x.course])).rows[0].n,0);
 await reject('course_creator_frozen_identity_mutation',c=>q(c,'UPDATE courses SET creator_id=$1 WHERE id=$2',[f.users.otherTeacher.id,x.course]),/^Training public round course identity is retained$/);
 const oldAttempt=uid(),roundAttempt=uid();
 const addAttempt=(c,{id=uid(),token=x.newToken,parent=x.parent,course=x.course,user=null}={})=>q(c,'INSERT INTO composite_assessment_attempts(id,composite_assessment_id,access_token_id,participant_key,delivery_course_id,user_id) VALUES($1,$2,$3,$4,$5,$6)',[id,parent,token,uid(),course,user]);
 await addAttempt(observer,{id:oldAttempt,token:x.token});await addAttempt(observer,{id:roundAttempt});
 const unusedRoundToken=await tokenInsert(observer,{parent:x.parent,round:x.round});
 for(const [name,token] of [['delete_attempt_bound_round_token',x.newToken],['delete_unused_round_token',unusedRoundToken]]){
  await reject(name,c=>q(c,'DELETE FROM composite_assessment_access_tokens WHERE id=$1',[token]),/links are retained; revoke instead/);
  assert.equal((await q(observer,'SELECT count(*)::int n FROM composite_assessment_access_tokens WHERE id=$1',[token])).rows[0].n,1);
 }
 assert.equal((await q(observer,'SELECT access_token_id FROM composite_assessment_attempts WHERE id=$1',[roundAttempt])).rows[0].access_token_id,x.newToken,'FK SET NULL must not erase the original frozen link');
 const disposableLegacyToken=await tokenInsert(observer,{parent:x.parent});
 const legacyDelete=await q(observer,'DELETE FROM composite_assessment_access_tokens WHERE id=$1 RETURNING id',[disposableLegacyToken]);
 assert.equal(legacyDelete.rowCount,1);assert.equal((await q(observer,'SELECT count(*)::int n FROM composite_assessment_access_tokens WHERE id=$1',[disposableLegacyToken])).rows[0].n,0);
 h.result.measurements.push({case:'delete_fresh_legacy_null_token',transaction:{status:'committed'},deletedCount:legacyDelete.rowCount,remainingCount:0});h.check('Fresh legacy-null token deletion remains allowed; both frozen token deletion paths reject without FK binding loss');
 const attemptBefore=(await q(observer,'SELECT to_jsonb(a) row FROM composite_assessment_attempts a WHERE id=ANY($1::text[]) ORDER BY id',[[oldAttempt,roundAttempt]])).rows;
 for(const [name,sql,values] of [
  ['old_attempt_round_upgrade','UPDATE composite_assessment_attempts SET access_token_id=$1 WHERE id=$2',[x.newToken,oldAttempt]],
  ['round_attempt_null_link','UPDATE composite_assessment_attempts SET access_token_id=NULL WHERE id=$1',[roundAttempt]],
  ['round_attempt_other_link','UPDATE composite_assessment_attempts SET access_token_id=$1 WHERE id=$2',[x.token,roundAttempt]],
  ['round_attempt_null_course','UPDATE composite_assessment_attempts SET delivery_course_id=NULL WHERE id=$1',[roundAttempt]],
  ['round_attempt_other_course','UPDATE composite_assessment_attempts SET delivery_course_id=$1 WHERE id=$2',[x.otherCourse,roundAttempt]],
  ['round_attempt_user_binding','UPDATE composite_assessment_attempts SET user_id=$1 WHERE id=$2',[f.users.student.id,roundAttempt]],
  ['round_attempt_other_parent','UPDATE composite_assessment_attempts SET composite_assessment_id=$1 WHERE id=$2',[x.otherParent,roundAttempt]],
 ])await reject(name,c=>q(c,sql,values),/anonymous identity are retained/);
 for(const [name,patch] of [['new_round_attempt_wrong_course',{course:x.otherCourse}],['new_round_attempt_null_course',{course:null}],['new_round_attempt_named_user',{user:f.users.student.id}],['new_round_attempt_wrong_parent',{parent:x.otherParent}]])await reject(name,c=>addAttempt(c,patch),/exact round course and anonymous link/);
 assert.deepEqual((await q(observer,'SELECT to_jsonb(a) row FROM composite_assessment_attempts a WHERE id=ANY($1::text[]) ORDER BY id',[[oldAttempt,roundAttempt]])).rows,attemptBefore);
 h.result.counts.push({case:'attempt_rebinding_and_bad_insert_atomicity',syntheticAttempts:2,unchanged:true});
 const invalid=await fixture();await reject('invalid_round_publication_hash',c=>roundInsert(c,invalid,uid(),{publication_hash:'0'.repeat(64)}),/publication hash mismatch/);await reject('invalid_round_over_48h',c=>roundInsert(c,invalid,uid(),{closes_at:new Date(Date.now()+49*3600000)}),null,['23514']);await reject('invalid_round_publication',c=>roundInsert(c,invalid,uid(),{publication_identity:{schemaVersion:1}}),/publication identity mismatch/);await reject('invalid_round_policy_timezone',c=>roundInsert(c,invalid,uid(),{group_ip_policy:{schemaVersion:1,timeZone:'Invalid/C21',activationDate:new Date().toISOString().slice(0,10)}}),/valid time zone/);
 const atomic=await fixture();await reject('round_and_token_forced_statement_rollback',async c=>{await freeze(c,atomic);await q(c,'SELECT 1/0')},/division by zero/,['22012']);assert.deepEqual(await counts(atomic),{rounds:0,new_tokens:0,deliveries:1,waves:0});h.result.counts.push({case:'round_token_atomic_rollback',after:await counts(atomic)});
 assert.equal((await q(observer,'SELECT training_round_id FROM composite_assessment_access_tokens WHERE id=$1',[x.token])).rows[0].training_round_id,null);
 if(remainingOnly)await verifyPriorFixturesUnchanged();
 h.result.coverageLimitations=['Database transaction guard coverage only; HTTP authorization, scorer and service validation are separate functional-phase evidence.','New raw fixtures are retained in the disposable clone for evidence; no prior production-derived rows are changed.'];h.result.passed=true
}catch(e){error=e;throw e}finally{for(const c of [...connections]){await rollback(c);await end(c)}await h.finish(error)}
