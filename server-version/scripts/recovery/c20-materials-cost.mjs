/** Serial process-wide SQL observations, not C26 capacity qualification. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {harness,prisma,candidateProof,noWrites,prefix,products} from './c20-materials-client.mjs'
import {logins,participant,formMaterialProduct,form,formRows,unitKey,publish,expiry} from './c20-materials-fixture.mjs'
const h=harness('cost');let error
try{
 const f=h.read('c20-fixture-private.json'),{teacher}=await logins(h,f),key='c20-cost-'+randomUUID(),product=await formMaterialProduct(teacher,f,{experimentKey:key,limits:{a:1,b:1},maxAttempts:5}),actor=await participant(h,f,'cost')
 async function measure(label,fn){const index=h.result.requests.length,start=performance.now(),v=await fn(),requests=h.result.requests.slice(index);h.result.measurements.push({label,elapsedMs:performance.now()-start,apiSqlEvents:requests.reduce((n,r)=>n+r.apiSqlEvents,0),responseBytes:requests.reduce((n,r)=>n+r.bytes,0),requestWindows:requests.length});return v}
 const {attempt}=await measure('cold_first_claim',()=>actor.client.request(`${prefix}/${product.id}/attempts`,'POST',{})),initial=await candidateProof(attempt.id)
 await measure('warm_recovery',()=>actor.client.request(`${prefix}/attempts/${attempt.id}`))
 await measure('warm_existing_start',()=>actor.client.request(`${prefix}/${product.id}/attempts`,'POST',{}))
 const next=await measure('restart_same_claim',()=>actor.client.request(`${prefix}/attempts/${attempt.id}/restart`,'POST',{}));assert.equal((await candidateProof(next.attempt.id)).candidate.materialAssignment.claimId,initial.candidate.materialAssignment.claimId)
 const second=await formMaterialProduct(teacher,f,{experimentKey:key,limits:{a:1,b:1}})
 await measure('linked_new_publication',()=>actor.client.request(`${prefix}/${second.id}/attempts`,'POST',{}))
 const filler=await participant(h,f,'cost_fill');await filler.client.request(`${prefix}/${product.id}/attempts`,'POST',{})
 const full=await participant(h,f,'cost_full');await noWrites(h,'full quota failure without writes',()=>measure('full_quota_denial',()=>full.client.request(`${prefix}/${product.id}/attempts`,'POST',{},409)))
 for(const m of h.result.measurements){assert.ok(Number.isInteger(m.apiSqlEvents)&&m.apiSqlEvents>0);assert.ok(m.responseBytes>0)}
 const storage=[]
 for(const groupCount of [2,8]){
  let candidateProduct=await teacher.request(products,'POST',{requestId:randomUUID(),name:'C20 equal-size material candidate',questionnaireType:'COURSE',courseIds:[f.courseId],publicEnabled:false})
  candidateProduct=await teacher.request(`${products}/${candidateProduct.id}/items`,'POST',{revision:candidateProduct.revision,item:form('same_prompt')})
  const groups=Array.from({length:groupCount},(_,i)=>({groupKey:String.fromCharCode(97+i),weight:1,materialTitle:'Same title',materialBody:'x'.repeat(8000)})),config={schemaVersion:2,experiment:{experimentKey:'size_'+candidateProduct.id,linkedPolicy:'RERANDOMIZE',groups},quotaPolicy:{schemaVersion:1,groupLimits:Object.fromEntries(groups.map(g=>[g.groupKey,10]))},blocks:[{blockKey:'form',kind:'INSTRUMENT',instrumentKey:unitKey(formRows(candidateProduct)[0])}]}
  candidateProduct=await publish(teacher,candidateProduct,config)
  const subject=await participant(h,f,'storage'),{attempt:entered}=await subject.client.request(`${prefix}/${candidateProduct.id}/attempts`,'POST',{}),proof=await candidateProof(entered.id),plain=JSON.stringify(proof.candidate)
  assert.ok(!plain.includes('x'.repeat(100)));assert.ok(!plain.includes('materialBody'));assert.ok(!plain.includes('materialTitle'))
  assert.equal(entered.trainingFlow.materials[0].body,'x'.repeat(8000))
  assert.equal(await prisma.trainingMaterialAllocationClaim.count({where:{compositeId:candidateProduct.id}}),1)
  assert.equal((await prisma.trainingMaterialQuotaBucket.findMany({where:{compositeId:candidateProduct.id}})).reduce((n,b)=>n+b.assignedCount,0),1)
  storage.push({groupCount,configBytes:Buffer.byteLength(JSON.stringify(candidateProduct.trainingFlowFrozen)),candidatePlainBytes:Buffer.byteLength(plain),candidateCipherBytes:Buffer.byteLength(proof.row.trainingFlowSnapshotEncrypted),attemptId:entered.id})
 }
 assert.ok(storage[1].configBytes>storage[0].configBytes+40000)
 assert.equal(storage[1].candidatePlainBytes,storage[0].candidatePlainBytes,'candidate JSON must not expand with unselected group bodies')
 assert.equal(storage[1].candidateCipherBytes,storage[0].candidateCipherBytes,'candidate cipher must not expand with group count')
 h.result.materialStorage=storage;h.check('Legal 2-versus-8 group real admissions retain fixed-size candidate envelopes while published material configuration expands')
 h.result.qualification={capacity:false,sql:'Serial process-wide API event windows; query-shape/batch cost is measured separately by consumer-cost. Not per-query latency or throughput.'}
 h.check('Cold, warm recovery/start, restart, linked publication and full quota costs observed on real PG production dist')
 h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
