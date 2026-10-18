/** C20 termination, recovery, refused facts and suppressed-dependency phase.
 * All facts come through ordinary HTTP FINAL; no child/path proof is seeded. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {harness,drainReports,prisma,children,candidateProof,noWrites,assertHidden,readCognitiveQuota,decryptUnifiedRuntimePayload,denied,prefix,pub,products} from './c20-materials-client.mjs'
import {logins,participant,formBody,formRows,form,unitKey,condition,publish,expiry} from './c20-materials-fixture.mjs'
const h=harness('branches');let error
const processedOutboxes=[]
async function materializeTerminal(attemptId){
 const before=await candidateProof(attemptId),child=await children(attemptId)
 assert.equal(before.row.status,'IN_PROGRESS');assert.equal(before.proof.path.currentInstrumentKey,null);assert.notEqual(before.proof.path.termination,'PENDING')
 assert.equal(child.jobs.length,1);assert.equal(child.jobs[0].status,'PENDING');assert.equal(child.jobs[0].attemptCount,0)
 h.result.measurements.push({stage:'TERMINAL_BEFORE_ORIGINAL_WORKER',attemptId,parentStatus:before.row.status,pathHash:before.row.trainingFlowPathHash,jobStatus:child.jobs[0].status,requestedRevision:child.jobs[0].requestedRevision})
 processedOutboxes.push(...await drainReports(h,[attemptId]));h.result.originalOutboxProcessed=processedOutboxes
 const after=await candidateProof(attemptId);assert.deepEqual(after.stable,before.stable);assert.equal(after.row.trainingFlowPathHash,before.row.trainingFlowPathHash)
 assert.deepEqual((await children(attemptId)).snapshots,child.snapshots)
}
try{
 const fixture=h.read('c20-fixture-private.json'),product=fixture.product,{teacher,otherTeacher}=await logins(h,fixture)
 for(const [mode,termination,satisfaction]of [['screen','SCREEN_OUT','NOT_SATISFIED'],['early','COMPLETE_EARLY','SATISFIED'],['refused','COMPLETE_EARLY','NOT_SATISFIED']]){
  const {user,client}=await participant(h,fixture,mode),quotaBefore=await readCognitiveQuota(prisma,user.id,fixture.assignmentId)
  let {attempt}=await client.request(`${prefix}/${product.id}/attempts`,'POST',{})
  const initial=await candidateProof(attempt.id);assert.equal(attempt.trainingFlow.termination,'PENDING');assert.deepEqual(attempt.trainingFlow.materials.map(v=>v.blockKey),['assigned_material','intro'])
  const body=formBody(attempt,mode),route=`${prefix}/attempts/${attempt.id}/form-sections/${attempt.currentItem.id}/submit`
  await client.request(route,'POST',body);assert.equal((await client.request(route,'POST',body)).replayed,true)
  await materializeTerminal(attempt.id)
  attempt=await client.request(`${prefix}/attempts/${attempt.id}`)
  const proof=await candidateProof(attempt.id),child=await children(attempt.id)
  assert.equal(attempt.status,'COMPLETED');assert.equal(attempt.currentItem,null);assert.equal(attempt.trainingFlow.termination,termination);assert.equal(proof.row.taskSatisfaction,satisfaction);assert.equal(proof.proof.path.taskSatisfaction,satisfaction)
  assert.deepEqual(proof.stable,initial.stable);assert.deepEqual([child.forms.length,child.scales.length,child.cognitive.length,child.sjt.length,child.snapshots.length],[1,0,0,0,1])
  assert.equal(child.snapshots[0].payloadKind,'COLLECTION_FACTS');assert.equal(child.snapshots[0].canonicalResultEncrypted,null)
  assert.equal(child.jobs.length,1);assertHidden(attempt,product,['FORM'])
  assert.equal((await readCognitiveQuota(prisma,user.id,fixture.assignmentId)).usedAttempts,0)
  const available=await client.request(`${prefix}/available`),listed=available.list.find(row=>row.id===product.id);assert.ok(listed);assert.equal(listed.hasSatisfiedAttempt,satisfaction==='SATISFIED');assert.equal(listed.latestCompletedAttempt.taskSatisfied,satisfaction==='SATISFIED')
  if(mode==='refused')assert.ok(proof.proof.path.acceptedFacts.every(fact=>fact.hasValidMeasurement===false&&fact.requirementSatisfied===false))
  await noWrites(h,mode+' terminal restart denial',()=>client.request(`${prefix}/attempts/${attempt.id}/restart`,'POST',{},409))
  fixture.cases.push({name:mode,attemptId:attempt.id,user,productId:product.id,termination,satisfaction,candidate:proof.stable});h.write('c20-fixture-private.json',fixture)
  h.result.measurements.push({stage:mode,quotaBefore,quotaAfter:await readCognitiveQuota(prisma,user.id,fixture.assignmentId),candidate:proof.stable,pathHash:proof.row.trainingFlowPathHash,acceptedUnits:1,unexecutedNativeChildren:0})
  h.check(`${mode}: accepted typed FINAL drives ${termination}/${satisfaction}; real student list consumes satisfaction, skipped native facts/scores/quota stay absent`)
 }
 // Real anonymous admission/recovery, separate from unsupported anonymousStudy.
 const token=await teacher.request(`${prefix}/${product.id}/public-tokens`,'POST',{expiresAt:new Date(Date.now()+1800000).toISOString(),maxUses:1})
 const anonymous=h.client();await anonymous.request('/auth/csrf')
 const info=await anonymous.request(`${pub}/${token.token}`);assert.deepEqual(info.items,[]);assert.deepEqual(info.units,[]);assert.deepEqual(info.formSections,[])
 let started=await anonymous.request(`${pub}/${token.token}/start`,'POST',{});anonymous.recovery=started.recoveryToken
 const initial=await candidateProof(started.attempt.id),resumed=await anonymous.request(`${pub}/${token.token}/start`,'POST',{recoveryToken:anonymous.recovery});assert.equal(resumed.attempt.id,started.attempt.id)
 const body=formBody(started.attempt,'screen');await anonymous.request(`${pub}/attempts/${started.attempt.id}/form-sections/${started.attempt.currentItem.id}/submit`,'POST',body)
 await materializeTerminal(started.attempt.id)
 const final=await anonymous.request(`${pub}/attempts/${started.attempt.id}`);assert.equal(final.status,'COMPLETED');assert.equal(final.trainingFlow.termination,'SCREEN_OUT')
 const recovered=await anonymous.request(`${pub}/${token.token}/start`,'POST',{recoveryToken:anonymous.recovery});assert.equal(recovered.attempt.id,final.id);assert.equal(recovered.attempt.status,'COMPLETED');assert.deepEqual((await candidateProof(final.id)).stable,initial.stable)
 assert.equal((await prisma.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:token.id}})).usedCount,1)
 fixture.cases.push({name:'public_screen',attemptId:final.id,productId:product.id,termination:'SCREEN_OUT',satisfaction:'NOT_SATISFIED',recovery:anonymous.recovery,token:token.token,candidate:initial.stable});h.write('c20-fixture-private.json',fixture)
 h.check('Public candidate metadata stays hidden; authenticated recovery preserves one END path/candidate and public-token usedCount=1 before and after terminal state')
 h.result.completed=fixture.cases.filter(c=>c.name!=='fourtool').map(({user,recovery,token,...safe})=>safe);h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
