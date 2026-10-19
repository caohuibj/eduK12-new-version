/** Actual restricted principal guard failures, every probe rolled back. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {harness,prisma} from './c20-materials-client.mjs'
const h=harness('guards');let error
try{
 const tables=['training_material_experiments','training_material_subject_bindings','training_material_allocation_claims','training_material_quota_buckets']
 const projection=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,await prisma.$queryRawUnsafe(`SELECT to_jsonb(t) value FROM ${table} t ORDER BY id`)])))
 const before=await projection();for(const rows of Object.values(before))assert.ok(rows.length>0)
 for(const table of tables){
  const id=before[table][0].value.id
  for(const op of ['UPDATE','DELETE']){
   let denied=false
   try{await prisma.$transaction(async tx=>{try{await tx.$executeRawUnsafe(op==='DELETE'?`DELETE FROM ${table} WHERE id=$1`:`UPDATE ${table} SET ${table.endsWith('quota_buckets')?'max_assigned=max_assigned+1':'id=id'} WHERE id=$1`,id)}catch(e){denied=true;throw e}throw new Error('C20_GUARD_PROBE_ROLLBACK_UNEXPECTED_SUCCESS')})}catch(e){assert.ok(denied,'runtime '+op+' unexpectedly allowed on '+table)}
   h.check('Restricted runtime '+op+' rejected for '+table)
  }
 }
 // Each mutation below is rollback-only and uses the restricted principal.
 const [selected]=await prisma.$queryRawUnsafe(`SELECT c.id claim_id,b.id bucket_id FROM training_material_allocation_claims c JOIN training_material_quota_buckets b ON b.composite_id=c.composite_id AND b.publication_key=c.publication_key AND b.config_digest=c.config_digest AND b.group_key=c.group_key WHERE c.reservation_ordinal IS NOT NULL AND b.assigned_count<b.max_assigned ORDER BY c.id LIMIT 1`)
 assert.ok(selected,'A real non-full bucket with an existing ordinal claim is required')
 const claim=await prisma.trainingMaterialAllocationClaim.findUniqueOrThrow({where:{id:selected.claim_id}}),bucket=await prisma.trainingMaterialQuotaBucket.findUniqueOrThrow({where:{id:selected.bucket_id}})
 assert.ok(bucket.assignedCount<bucket.maxAssigned)
 async function rejectsTransaction(label,action,pattern){let failure
  try{await prisma.$transaction(async tx=>{await action(tx);await tx.$executeRawUnsafe('SET CONSTRAINTS training_material_claim_attempt_fk, training_material_binding_initial_claim_fk, training_material_claim_scope, training_material_binding_scope, training_material_quota_claim_scope IMMEDIATE');throw new Error('UNEXPECTED_SUCCESS_ROLLBACK')})}catch(e){failure=e}
  assert.ok(failure&&failure.message!=='UNEXPECTED_SUCCESS_ROLLBACK',label+' must be rejected by PostgreSQL');assert.match(failure.message,pattern,label+' wrong failure boundary');h.check(label)
 }
 for(const [label,patch] of [['nonzero initial counter',{assigned_count:1}],['wrong frozen capacity',{max_assigned:bucket.maxAssigned===10000?9999:bucket.maxAssigned+1}],['unknown frozen group',{group_key:'c20_unknown_group'}],['wrong publication config',{config_digest:'0'.repeat(64)}]]){
  await rejectsTransaction('Initial bucket rejects '+label,tx=>tx.$executeRawUnsafe(`INSERT INTO training_material_quota_buckets SELECT (jsonb_populate_record(NULL::training_material_quota_buckets,to_jsonb(b)||$1::jsonb)).* FROM training_material_quota_buckets b WHERE id=$2`,JSON.stringify({id:randomUUID(),assigned_count:0,...patch}),bucket.id),/frozen publication and start empty/)
 }
 async function probeClaim(tx,source,patch){
  const parent=randomUUID()
  await tx.$executeRawUnsafe(`INSERT INTO composite_assessment_attempts SELECT (jsonb_populate_record(NULL::composite_assessment_attempts,to_jsonb(t)||jsonb_build_object('id',$1::text,'recovery_token_hash',NULL,'attempt_no',(SELECT coalesce(max(attempt_no),0)+1 FROM composite_assessment_attempts WHERE composite_assessment_id=t.composite_assessment_id AND participant_key=t.participant_key)))).* FROM composite_assessment_attempts t WHERE id=$2`,parent,source.initialAttemptId)
  await tx.$executeRawUnsafe('SET CONSTRAINTS training_material_claim_scope IMMEDIATE')
  await tx.$executeRawUnsafe(`INSERT INTO training_material_allocation_claims SELECT (jsonb_populate_record(NULL::training_material_allocation_claims,to_jsonb(c)||$1::jsonb)).* FROM training_material_allocation_claims c WHERE id=$2`,JSON.stringify({id:randomUUID(),initial_attempt_id:parent,...patch}),source.id)
 }
 await rejectsTransaction('Quota claim rejects missing reservation ordinal',tx=>probeClaim(tx,claim,{reservation_ordinal:null}),/frozen quota reservation/)
 await rejectsTransaction('Claim cannot move to another frozen config',tx=>probeClaim(tx,claim,{config_digest:'0'.repeat(64)}),/exact frozen course, author, attempt, experiment and group/)
 const [cross]=await prisma.$queryRawUnsafe(`SELECT c.id claim_id,b.group_key target_group FROM training_material_allocation_claims c JOIN training_material_quota_buckets b ON b.composite_id=c.composite_id AND b.publication_key=c.publication_key AND b.config_digest=c.config_digest AND b.group_key<>c.group_key WHERE c.inherited_from_claim_id IS NULL AND c.reservation_ordinal>b.assigned_count ORDER BY c.id LIMIT 1`)
 assert.ok(cross,'A genuine ordinal unavailable in another same-publication bucket is required')
 const crossClaim=await prisma.trainingMaterialAllocationClaim.findUniqueOrThrow({where:{id:cross.claim_id}})
 await rejectsTransaction('Claim cannot reuse another bucket reservation',tx=>probeClaim(tx,crossClaim,{group_key:cross.target_group}),/frozen quota reservation/)
 await rejectsTransaction('Quota increment without a matching ordinal claim rejected',tx=>tx.$executeRawUnsafe('UPDATE training_material_quota_buckets SET assigned_count=assigned_count+1 WHERE id=$1',bucket.id),/unique immutable claim/)
 await rejectsTransaction('Quota cannot jump by two reservations',tx=>tx.$executeRawUnsafe('UPDATE training_material_quota_buckets SET assigned_count=assigned_count+2 WHERE id=$1',bucket.id),/immutable|increment|one|reservation/i)
 await rejectsTransaction('Two allocation claims cannot share one quota ordinal',tx=>tx.$executeRawUnsafe(`INSERT INTO training_material_allocation_claims SELECT (jsonb_populate_record(NULL::training_material_allocation_claims,to_jsonb(c)||jsonb_build_object('id',$1::text,'initial_attempt_id',$2::text))).* FROM training_material_allocation_claims c WHERE id=$3`,randomUUID(),randomUUID(),claim.id),/training_material_claim_reservation_key/)
 await rejectsTransaction('Claim ordinal above reserved count rejected',tx=>probeClaim(tx,claim,{reservation_ordinal:bucket.assignedCount+1}),/frozen quota reservation/)
 assert.deepEqual(await projection(),before);h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
