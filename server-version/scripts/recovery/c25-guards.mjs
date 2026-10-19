/** New C22 SQL guard cases only. Every mutation is rolled back, including the
 * historical NULL write. No C23 guard/budget/CAS replay or accepted fact edit. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {harness,runtime,publicPostgresFailure,sha} from './c25-client.mjs'
const h=await harness('guards',120);let error,connection
try{
 const {require,prisma,backend}=await runtime(),{Client}=require('pg'),{canonicalHash}=require(backend+'/dist/modules/assessment-runtime/canonical.js'),f=h.read('c25-fixture-private.json')
 assert.equal(h.read('c25-prepare-result.json').passed,true);assert.equal(h.read('c25-scheduled-result.json').passed,true)
 const url=new URL(process.env.DATABASE_URL);url.searchParams.delete('connection_limit');url.searchParams.delete('pool_timeout');url.searchParams.set('application_name','c25_new_feedback_guard_transactions')
 connection=new Client({connectionString:url.toString()});await connection.connect()
 const q=(sql,values=[])=>connection.query(sql,values)
 const role=(await q('SELECT current_user AS name,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0]
 assert.equal(role.name,'eduk12_runtime');for(const key of ['rolsuper','rolcreatedb','rolcreaterole','rolbypassrls'])assert.equal(role[key],false)
 const ids=Object.values(f.cases).map(c=>c.attemptId),old=(await q('SELECT id FROM composite_assessment_attempts WHERE training_feedback_snapshot IS NULL AND NOT(id=ANY($1::text[])) ORDER BY id LIMIT 1',[ids])).rows[0];assert.ok(old)
 const allIds=[...ids,old.id],productIds=[f.products.A.id,f.products.scheduled.id]
 async function rows(){return {parents:(await q('SELECT to_jsonb(p) AS row FROM composite_assessments p WHERE id=ANY($1::text[]) ORDER BY id',[productIds])).rows,attempts:(await q('SELECT to_jsonb(p) AS row FROM composite_assessment_attempts p WHERE id=ANY($1::text[]) ORDER BY id',[allIds])).rows,checkpoints:(await q('SELECT to_jsonb(p) AS row FROM training_attempt_checkpoints p WHERE attempt_id=ANY($1::text[]) ORDER BY attempt_id',[ids])).rows,counts:(await q('SELECT (SELECT count(*) FROM composite_assessments)::int AS parents,(SELECT count(*) FROM composite_assessment_attempts)::int AS attempts,(SELECT count(*) FROM training_attempt_checkpoints)::int AS checkpoints')).rows}}
 const baseline=await rows();h.write('c25-guards-before-private.json',baseline)
 async function reject(label,sql,values,{code='P0001',message,setup}={}){
  const before=await rows();let rejected
  try{await q('BEGIN');await q("SET LOCAL statement_timeout='5000ms'");await q("SET LOCAL lock_timeout='1000ms'");if(setup)await setup();try{await q(sql,values)}catch(e){rejected=e;h.record({stage:'GUARD_REJECTED',label,error:{code:e.code,message:e.message,detail:e.detail,constraint:e.constraint}})}assert.ok(rejected,'C25 guard unexpectedly accepted '+label);assert.equal(rejected.code,code);if(message)assert.match(rejected.message,message)}finally{await q('ROLLBACK')}
  const after=await rows();assert.deepEqual(after,before,'rollback changed target rows');h.result.measurements.push({case:label,...publicPostgresFailure(rejected),beforeSha256:sha(JSON.stringify(before)),afterSha256:sha(JSON.stringify(after))})
 }
 const draftId=randomUUID(),cloneDraft=()=>q(`INSERT INTO composite_assessments SELECT (jsonb_populate_record(NULL::composite_assessments,to_jsonb(p)||$2::jsonb)).* FROM composite_assessments p WHERE id=$1`,[f.products.A.id,JSON.stringify({id:draftId,code:'C25-'+draftId,creation_key:null,name:'C25 rolled-back nullable pair guard',status:'DRAFT',published_at:null,training_feedback_policy:null,training_feedback_policy_hash:null})])
 for(const [label,patch] of [['policy-without-hash',{training_feedback_policy:{schemaVersion:1,mode:'IMMEDIATE'}}],['hash-without-policy',{training_feedback_policy_hash:'0'.repeat(64)}],['policy-malformed-hash',{training_feedback_policy:{schemaVersion:1,mode:'IMMEDIATE'},training_feedback_policy_hash:'not-a-digest'}]]){
  await reject(label,'UPDATE composite_assessments SET training_feedback_policy=$2::jsonb,training_feedback_policy_hash=$3 WHERE id=$1',[draftId,patch.training_feedback_policy?JSON.stringify(patch.training_feedback_policy):null,patch.training_feedback_policy_hash??null],{code:'23514',message:/training_feedback_policy_pair/,setup:cloneDraft})
 }
 const a=f.cases.A,b=f.cases.B,c=f.cases.C,d=f.cases.D
 for(const [label,sql,values,pattern] of [
  ['published-policy-immutable','UPDATE composite_assessments SET training_feedback_policy=NULL,training_feedback_policy_hash=NULL WHERE id=$1',[f.products.scheduled.id],/Published Training feedback policy is immutable/],
  ['published-time-reset','UPDATE composite_assessments SET published_at=NULL WHERE id=$1',[f.products.A.id],/publication identity cannot be reset/],
  ['published-time-move','UPDATE composite_assessments SET published_at=published_at+interval \'1 second\' WHERE id=$1',[f.products.A.id],/publication identity cannot be reset/],
  ['published-status-draft','UPDATE composite_assessments SET status=\'DRAFT\' WHERE id=$1',[f.products.A.id],/publication identity cannot be reset/],
  ['attempt-snapshot-immutable','UPDATE composite_assessment_attempts SET training_feedback_snapshot=NULL,training_feedback_snapshot_hash=NULL WHERE id=$1',[b.attemptId],/Training feedback attempt snapshot is immutable/],
  ['attempt-epoch-mismatch','UPDATE composite_assessment_attempts SET attempt_epoch=attempt_epoch+1 WHERE id=$1',[b.attemptId],/Training feedback identity requires a new attempt/],
  ['attempt-owner-mismatch','UPDATE composite_assessment_attempts SET user_id=$2 WHERE id=$1',[b.attemptId,f.actors.outsider.id],/Training feedback identity requires a new attempt/],
  ['attempt-course-mismatch','UPDATE composite_assessment_attempts SET delivery_course_id=NULL WHERE id=$1',[b.attemptId],/Training feedback identity requires a new attempt/],
  ['attempt-token-mismatch','UPDATE composite_assessment_attempts SET access_token_id=$2 WHERE id=$1',[c.attemptId,d.accessTokenId],/Training feedback identity requires a new attempt/],
  ['attempt-publication-mismatch','UPDATE composite_assessment_attempts SET composite_assessment_id=$2 WHERE id=$1',[b.attemptId,f.products.A.id],/Training feedback identity requires a new attempt/],
 ])await reject(label,sql,values,{message:pattern})
 const insertSql='INSERT INTO composite_assessment_attempts SELECT (jsonb_populate_record(NULL::composite_assessment_attempts,to_jsonb(p)||$2::jsonb)).* FROM composite_assessment_attempts p WHERE id=$1'
 async function newAttemptPatch(source,changes={}){
  const row=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:source.attemptId}}),id=randomUUID(),snapshot={...row.trainingFeedbackSnapshot,attemptId:id},persistence={...row.trainingPersistenceSnapshot,attemptId:id}
  return {id,participant_key:'c25-rollback-'+id,recovery_token_hash:null,status:'IN_PROGRESS',completed_at:null,training_feedback_snapshot:snapshot,training_feedback_snapshot_hash:canonicalHash(snapshot),training_persistence_snapshot:persistence,training_persistence_snapshot_hash:canonicalHash(persistence),...changes}
 }
 const omitted=await newAttemptPatch(a,{training_feedback_snapshot:null,training_feedback_snapshot_hash:null})
 await reject('old-binary-omits-configured-snapshot',insertSql,[a.attemptId,JSON.stringify(omitted)],{message:/publication and attempt configuration mismatch/})
 for(const [label,key,value] of [['insert-wrong-attempt-id','attemptId',randomUUID()],['insert-wrong-epoch','attemptEpoch',2],['insert-wrong-course','courseId',randomUUID()],['insert-wrong-publication','compositeId',f.products.A.id],['insert-wrong-token','accessTokenId',d.accessTokenId],['insert-wrong-round','roundId',null]]){
  const patch=await newAttemptPatch(c);patch.training_feedback_snapshot[key]=value;patch.training_feedback_snapshot_hash=canonicalHash(patch.training_feedback_snapshot)
  await reject(label,insertSql,[c.attemptId,JSON.stringify(patch)],{message:/Training feedback frozen identity mismatch/})
 }
 for(const [label,changes] of [['snapshot-without-hash',{training_feedback_snapshot_hash:null}],['snapshot-malformed-hash',{training_feedback_snapshot_hash:'malformed'}]]){
  const patch=await newAttemptPatch(a,changes);await reject(label,insertSql,[a.attemptId,JSON.stringify(patch)],{code:'23514',message:/training_feedback_snapshot_pair/})
 }
 // Missing snapshot + orphan hash exercises the nullable pair on a historical
 // NULL parent without changing that parent; all inserted state is rolled back.
 const oldPatch={id:randomUUID(),participant_key:'c25-rollback-'+randomUUID(),recovery_token_hash:null,training_feedback_snapshot:null,training_feedback_snapshot_hash:'0'.repeat(64)}
 await reject('hash-without-snapshot',insertSql,[old.id,JSON.stringify(oldPatch)],{code:'23514',message:/training_feedback_snapshot_pair/})
 const source=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:b.attemptId}})
 await reject('historical-null-upgrade-rolled-back','UPDATE composite_assessment_attempts SET training_feedback_snapshot=$2::jsonb,training_feedback_snapshot_hash=$3 WHERE id=$1',[old.id,JSON.stringify(source.trainingFeedbackSnapshot),source.trainingFeedbackSnapshotHash],{message:/Training feedback attempt snapshot is immutable/})
 assert.deepEqual(await rows(),baseline);h.write('c25-guards-after-private.json',await rows())
 h.result.preservedC23Evidence={replayed:false,scope:'C23 guards/CAS/budget remain unchanged; prior evidence retained by launcher'}
 h.result.passed=true;h.check('New C22 nullable pairs/hash shape, immutable publication/snapshot/identity, old-binary omission and mismatched new bindings reject with complete rollback')
}catch(e){error=e}finally{if(connection){await connection.query('ROLLBACK').catch(()=>{});await connection.end()}await h.finish(error)}
