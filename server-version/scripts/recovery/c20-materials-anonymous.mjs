/** Four real first-reached native capabilities, no accepted FINAL before restart. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {harness,prisma,children,candidateProof,noWrites,cognitiveFinal,denied,prefix,pub} from './c20-materials-client.mjs'
import {logins,materialProduct,formBody} from './c20-materials-fixture.mjs'
const h=harness('anonymous');let error
try{
 const fixture=h.read('c20-fixture-private.json'),{teacher}=await logins(h,fixture)
 for(const type of ['FORM','SCALE','COGNITIVE','SITUATIONAL']){
  const product=await materialProduct(teacher,fixture,{name:'C20 anonymous '+type,firstType:type,maxAttempts:2})
  const token=await teacher.request(`${prefix}/${product.id}/public-tokens`,'POST',{expiresAt:new Date(Date.now()+1800000).toISOString(),maxUses:1})
  const client=h.client();await client.request('/auth/csrf');const first=await client.request(`${pub}/${token.token}/start`,'POST',{});client.recovery=first.recoveryToken
  const before=await candidateProof(first.attempt.id),oldChildren=await children(first.attempt.id),a=before.candidate.materialAssignment
  assert.equal(first.attempt.currentItem.type,type==='FORM'?'FORM_SECTION':type)
  const resumed=await client.request(`${pub}/${token.token}/start`,'POST',{recoveryToken:first.recoveryToken});assert.equal(resumed.attempt.id,first.attempt.id)
  const buckets=await prisma.trainingMaterialQuotaBucket.findMany({where:{compositeId:product.id},orderBy:{id:'asc'}}),claims=await prisma.trainingMaterialAllocationClaim.findMany({where:{compositeId:product.id}})
  let sjtRuntime;
  if(type==='COGNITIVE')await client.request(`/public/cognitive/sessions/${oldChildren.cognitive[0].id}`)
  if(type==='SITUATIONAL')sjtRuntime=await client.request(`${pub}/attempts/${first.attempt.id}/items/${first.attempt.currentItem.id}/situational/${first.attempt.currentItem.situationalAttemptId}`)
  const next=await client.request(`${pub}/attempts/${first.attempt.id}/restart`,'POST',{});assert.notEqual(next.recoveryToken,first.recoveryToken)
  const after=await candidateProof(next.attempt.id),b=after.candidate.materialAssignment
  assert.equal(after.row.participantKey,before.row.participantKey);assert.equal(after.row.attemptNo,before.row.attemptNo+1);assert.equal(after.row.attemptEpoch,before.row.attemptEpoch+1)
  assert.equal((await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:first.attempt.id}})).recoveryTokenHash,null)
  for(const key of ['claimId','experimentId','participantKey','groupKey','materialDigest','algorithm'])assert.equal(b[key],a[key])
  assert.notEqual(a.assignmentHash,b.assignmentHash)
  assert.deepEqual(await prisma.trainingMaterialQuotaBucket.findMany({where:{compositeId:product.id},orderBy:{id:'asc'}}),buckets)
  assert.deepEqual(await prisma.trainingMaterialAllocationClaim.findMany({where:{compositeId:product.id}}),claims)
  assert.equal((await prisma.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:token.id}})).usedCount,1)
  const unit=first.attempt.currentItem;let route,body,get
  if(type==='FORM'){route=`${pub}/attempts/${first.attempt.id}/form-sections/${unit.id}/submit`;body=formBody(first.attempt)}
  if(type==='SCALE'){assert.equal(oldChildren.scales.length,1);route=`${pub}/attempts/${first.attempt.id}/items/${unit.id}/scale/submit`;body={submissionId:randomUUID(),attemptEpoch:first.attempt.attemptEpoch,definitionHash:unit.definitionHash,contextSnapshotHash:first.attempt.contextSnapshotHash,answers:[{itemCode:'mixed-scale-item-1',responseValue:'yes'}]}}
  if(type==='COGNITIVE'){get=`/public/cognitive/sessions/${oldChildren.cognitive[0].id}`;route=get+'/submit';body=cognitiveFinal(unit.cognitiveSession,first.recoveryToken)}
  if(type==='SITUATIONAL'){get=`${pub}/attempts/${first.attempt.id}/items/${unit.id}/situational/${unit.situationalAttemptId}`;const c=sjtRuntime.attempt;route=get+'/submit';body={submissionId:randomUUID(),attemptEpoch:c.attemptEpoch,definitionHash:c.definitionHash,compiledRuntimeHash:c.compiledRuntimeHash,scoringVersion:c.scoringVersion,responseProtocol:'sjt-online-response-v1',responses:fixture.sjtResponses}}
  await noWrites(h,'Old anonymous '+type+' parent and actual native capabilities rejected after rotation',async()=>{await client.request(`${pub}/attempts/${first.attempt.id}`,'GET',undefined,denied);await client.request(`${pub}/attempts/${first.attempt.id}/restart`,'POST',{},denied);if(get)await client.request(get,'GET',undefined,denied);await client.request(route,'POST',body,denied)})
  client.recovery=next.recoveryToken;assert.equal((await client.request(`${pub}/attempts/${next.attempt.id}`)).id,next.attempt.id)
  await noWrites(h,'ABANDONED counts toward anonymous maxAttempts',()=>client.request(`${pub}/attempts/${next.attempt.id}/restart`,'POST',{},409))
  h.result.measurements.push({type,oldAttemptId:first.attempt.id,newAttemptId:next.attempt.id,claimId:a.claimId,groupKey:a.groupKey,oldAssignmentHash:a.assignmentHash,newAssignmentHash:b.assignmentHash,quotaReserved:1,tokenUses:1})
  h.check(type+': stable participant, rotated credential, one immutable claim/quota reservation and real retired native rejection')
 }
 h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
