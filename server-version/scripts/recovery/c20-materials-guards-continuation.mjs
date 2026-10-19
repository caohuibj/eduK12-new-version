/** Exact remaining restricted-role guard assertions after 17 accepted rollback probes. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {harness,prisma,sha} from './c20-materials-client.mjs'
const h=harness('guards');let error
try{
 const oldFile=path.join(h.state,'c20-prior-guards-failed-result.json');assert.equal(sha(fs.readFileSync(oldFile)),'b0126ef206e694166c7fef3553fffe0bdd4ffae203b69e2788cd14ba71db0e44')
 const prior=h.read('c20-prior-guards-failed-result.json');assert.equal(prior.passed,false);assert.equal(prior.checks.length,17)
 assert.equal(prior.checks.at(-1),'Quota cannot jump by two reservations');assert.equal(prior.error.message,'Two allocation claims cannot share one quota ordinal wrong failure boundary')
 assert.equal(sha(fs.readFileSync(path.join(h.state,'c20-storage-functional-post-state.json'))),'073393eb60ace3423cdfe33b3f7b1f8d0eb0eb873f156de0297f037c14312389')
 h.result.priorProducer={runtimeSha256:'3823be7cc5b32bf4d5c8f80a636556b430b7a344ec3381795ff551a615e962ad',resultSha256:'b0126ef206e694166c7fef3553fffe0bdd4ffae203b69e2788cd14ba71db0e44',reusedChecks:prior.checks,preAndPostFailedGuardSnapshotSha256:'073393eb60ace3423cdfe33b3f7b1f8d0eb0eb873f156de0297f037c14312389',continuation:'Only duplicate ordinal structural SQLSTATE/index assertion and previously unissued above-count probe; all mutations rollback and exact four-table projections stay unchanged.'}
 const [role]=await prisma.$queryRawUnsafe('SELECT current_user AS name,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user');assert.equal(role.name,'eduk12_runtime');for(const k of ['rolsuper','rolcreatedb','rolcreaterole','rolbypassrls'])assert.equal(role[k],false)
 const columns=['composite_id','publication_key','config_digest','group_key','reservation_ordinal']
 const [index]=await prisma.$queryRawUnsafe(`SELECT ns.nspname AS schema,t.relname AS table,am.amname AS method,i.indisunique,i.indisvalid,i.indisready,pg_get_expr(i.indexprs,i.indrelid) AS expressions,pg_get_expr(i.indpred,i.indrelid) AS predicate,pg_get_indexdef(i.indexrelid) AS definition,ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ordinal) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum ORDER BY k.ordinal) AS columns FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace JOIN pg_am am ON am.oid=c.relam WHERE c.oid='public.training_material_claim_reservation_key'::regclass AND i.indrelid='public.training_material_allocation_claims'::regclass`)
 assert.ok(index?.indisunique&&index.indisvalid&&index.indisready);assert.equal(index.predicate,null);assert.deepEqual(index.columns,columns)
 assert.equal(index.schema,'public');assert.equal(index.table,'training_material_allocation_claims');assert.equal(index.method,'btree');assert.equal(index.expressions,null)
 const tables=['training_material_experiments','training_material_subject_bindings','training_material_allocation_claims','training_material_quota_buckets'],projection=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,await prisma.$queryRawUnsafe(`SELECT to_jsonb(t) value FROM ${table} t ORDER BY id`)])))
 const before=await projection(),[selected]=await prisma.$queryRawUnsafe(`SELECT c.id claim_id,b.id bucket_id FROM training_material_allocation_claims c JOIN training_material_quota_buckets b ON b.composite_id=c.composite_id AND b.publication_key=c.publication_key AND b.config_digest=c.config_digest AND b.group_key=c.group_key WHERE c.reservation_ordinal IS NOT NULL AND b.assigned_count<b.max_assigned ORDER BY c.id LIMIT 1`);assert.ok(selected)
 const claim=await prisma.trainingMaterialAllocationClaim.findUniqueOrThrow({where:{id:selected.claim_id}}),bucket=await prisma.trainingMaterialQuotaBucket.findUniqueOrThrow({where:{id:selected.bucket_id}});assert.ok(bucket.assignedCount<bucket.maxAssigned)
 let duplicate
 try{await prisma.$transaction(async tx=>{await tx.$executeRawUnsafe(`INSERT INTO training_material_allocation_claims SELECT (jsonb_populate_record(NULL::training_material_allocation_claims,to_jsonb(c)||jsonb_build_object('id',$1::text,'initial_attempt_id',$2::text))).* FROM training_material_allocation_claims c WHERE id=$3`,randomUUID(),randomUUID(),claim.id);throw new Error('UNEXPECTED_SUCCESS_ROLLBACK')})}catch(e){duplicate=e}
 assert.equal(duplicate?.meta?.code,'23505');assert.match(duplicate.meta.message,/^Key \(composite_id, publication_key, config_digest, group_key, reservation_ordinal\)=\(.+\) already exists[.]$/s)
 assert.deepEqual(await projection(),before)
 h.result.measurements.push({probe:'duplicate ordinal',sqlstate:duplicate.meta.code,indexDefinition:index.definition,columns})
 h.check('Two claims sharing a reservation are rejected with structured PostgreSQL 23505 and the exact five-column formal UNIQUE index')
 let above
 try{await prisma.$transaction(async tx=>{
  const parent=randomUUID()
  await tx.$executeRawUnsafe(`INSERT INTO composite_assessment_attempts SELECT (jsonb_populate_record(NULL::composite_assessment_attempts,to_jsonb(t)||jsonb_build_object('id',$1::text,'recovery_token_hash',NULL,'attempt_no',(SELECT coalesce(max(attempt_no),0)+1 FROM composite_assessment_attempts WHERE composite_assessment_id=t.composite_assessment_id AND participant_key=t.participant_key)))).* FROM composite_assessment_attempts t WHERE id=$2`,parent,claim.initialAttemptId)
  await tx.$executeRawUnsafe('SET CONSTRAINTS training_material_claim_scope IMMEDIATE')
  await tx.$executeRawUnsafe(`INSERT INTO training_material_allocation_claims SELECT (jsonb_populate_record(NULL::training_material_allocation_claims,to_jsonb(c)||$1::jsonb)).* FROM training_material_allocation_claims c WHERE id=$2`,JSON.stringify({id:randomUUID(),initial_attempt_id:parent,reservation_ordinal:bucket.assignedCount+1}),claim.id)
  throw new Error('UNEXPECTED_SUCCESS_ROLLBACK')
 })}catch(e){above=e}
 assert.equal(above?.meta?.code,'P0001');assert.equal(above.meta.message,'ERROR: Training material claim requires its frozen quota reservation')
 assert.deepEqual(await projection(),before)
 h.result.measurements.push({probe:'above reserved count',sqlstate:above.meta.code,assignedCount:bucket.assignedCount,attemptedOrdinal:bucket.assignedCount+1,maxAssigned:bucket.maxAssigned})
 h.check('Claim ordinal above reserved count fails the exact frozen-quota trigger; all four table projections remain unchanged')
 h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
