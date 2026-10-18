/** C19 termination, recovery, refused facts and suppressed-dependency phase.
 * All facts come through ordinary HTTP FINAL; no child/path proof is seeded. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {harness,drainReports,prisma,children,candidateProof,noWrites,assertHidden,readCognitiveQuota,decryptUnifiedRuntimePayload,denied,prefix,pub,products} from './c19-flow-client.mjs'
import {logins,participant,formBody,formRows,form,unitKey,condition,publish,expiry} from './c19-flow-fixture.mjs'
const h=harness('branches');let error
try{
 const fixture=h.read('c19-fixture-private.json'),product=fixture.product,{teacher,otherTeacher}=await logins(h,fixture)
 for(const [mode,termination,satisfaction]of [['screen','SCREEN_OUT','NOT_SATISFIED'],['early','COMPLETE_EARLY','SATISFIED'],['refused','COMPLETE_EARLY','NOT_SATISFIED']]){
  const {user,client}=await participant(h,fixture,mode),quotaBefore=await readCognitiveQuota(prisma,user.id,fixture.assignmentId)
  let {attempt}=await client.request(`${prefix}/${product.id}/attempts`,'POST',{})
  const initial=await candidateProof(attempt.id);assert.equal(attempt.trainingFlow.termination,'PENDING');assert.deepEqual(attempt.trainingFlow.materials.map(v=>v.blockKey),['intro'])
  const body=formBody(attempt,mode),route=`${prefix}/attempts/${attempt.id}/form-sections/${attempt.currentItem.id}/submit`
  await client.request(route,'POST',body);assert.equal((await client.request(route,'POST',body)).replayed,true)
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
  fixture.cases.push({name:mode,attemptId:attempt.id,user,productId:product.id,termination,satisfaction,candidate:proof.stable});h.write('c19-fixture-private.json',fixture)
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
 const final=await anonymous.request(`${pub}/attempts/${started.attempt.id}`);assert.equal(final.status,'COMPLETED');assert.equal(final.trainingFlow.termination,'SCREEN_OUT')
 const recovered=await anonymous.request(`${pub}/${token.token}/start`,'POST',{recoveryToken:anonymous.recovery});assert.equal(recovered.attempt.id,final.id);assert.equal(recovered.attempt.status,'COMPLETED');assert.deepEqual((await candidateProof(final.id)).stable,initial.stable)
 assert.equal((await prisma.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:token.id}})).usedCount,1)
 fixture.cases.push({name:'public_screen',attemptId:final.id,productId:product.id,termination:'SCREEN_OUT',satisfaction:'NOT_SATISFIED',recovery:anonymous.recovery,token:token.token,candidate:initial.stable});h.write('c19-fixture-private.json',fixture)
 h.check('Public candidate metadata stays hidden; authenticated recovery preserves one END path/candidate and public-token usedCount=1 before and after terminal state')
 // Copy uses the official authoring remapper and does not rewrite the source.
 const original=await teacher.request(`${products}/${product.id}`),copy=await teacher.request(`${products}/${product.id}/copy`,'POST',{requestId:randomUUID()})
 assert.equal(copy.trainingFlowFrozen,null);assert.equal(copy.trainingFlowDigest,null)
 const priorIds=new Set(product.items.map(item=>item.id));assert.ok(copy.items.every(item=>!priorIds.has(item.id)))
 assert.ok(copy.trainingFlowDraft.blocks.filter(b=>b.kind==='INSTRUMENT').every(block=>!product.trainingFlowDraft.blocks.some(old=>old.kind==='INSTRUMENT'&&old.instrumentKey===block.instrumentKey)))
 assert.deepEqual(await teacher.request(`${products}/${product.id}`),original)
 await otherTeacher.request(`${products}/${copy.id}/training-flow`,'POST',{revision:copy.revision,config:copy.trainingFlowDraft},[403,404])
 h.check('Official copy remaps section/item/condition identities and clears publication digest; original frozen definition is unchanged')
 // A skipped Form dependency must suppress NOT and IS_MISSING entirely.
 let dependency=await teacher.request(products,'POST',{requestId:randomUUID(),name:'C19 skipped-dependency NOT and missing',questionnaireType:'COURSE',courseIds:[fixture.courseId],publicEnabled:false})
 for(const item of [form('dependency_a'),{type:'SCALE',scaleId:fixture.scaleId,required:true},form('dependency_b'),{type:'COGNITIVE',cognitiveAssignmentId:fixture.assignmentId,required:true},{type:'SITUATIONAL',situationalInstrumentKey:fixture.sjt.release.instrumentKey,situationalInstrumentVersion:fixture.sjt.release.instrumentVersion,required:true}])dependency=await teacher.request(`${products}/${dependency.id}/items`,'POST',{revision:dependency.revision,item})
 const forms=formRows(dependency),a=forms.find(row=>row.formLabel==='dependency_a'),b=forms.find(row=>row.formLabel==='dependency_b');assert.notEqual(a.formSectionId,b.formSectionId)
 const byType=type=>dependency.items.find(item=>item.type===type),falseWhen=condition(a,'EQUALS','no'),notB={op:'NOT',term:condition(b,'EQUALS','yes')}
 const config={schemaVersion:1,blocks:[{blockKey:'a',kind:'INSTRUMENT',instrumentKey:unitKey(a)},
  {blockKey:'pending_not',kind:'MATERIAL',body:'Visible only after accepted A',when:{op:'NOT',term:condition(a,'EQUALS','no')}},
  {blockKey:'scale_skip',kind:'INSTRUMENT',instrumentKey:unitKey(byType('SCALE')),when:falseWhen},
  {blockKey:'b_skip',kind:'INSTRUMENT',instrumentKey:unitKey(b),when:falseWhen},
  {blockKey:'not_b_material',kind:'MATERIAL',body:'Must never show for skipped B',when:notB},
  {blockKey:'missing_b_material',kind:'MATERIAL',body:'Must never show for skipped B',when:condition(b,'IS_MISSING')},
  {blockKey:'cog_suppressed',kind:'INSTRUMENT',instrumentKey:unitKey(byType('COGNITIVE')),when:notB},
  {blockKey:'sjt_suppressed',kind:'INSTRUMENT',instrumentKey:unitKey(byType('SITUATIONAL')),when:condition(b,'IS_MISSING')} ]}
 dependency=await publish(teacher,dependency,config);const actor=await participant(h,fixture,'dependency'),begin=(await actor.client.request(`${prefix}/${dependency.id}/attempts`,'POST',{})).attempt
 assert.deepEqual(begin.trainingFlow.materials,[]);assert.equal(begin.trainingFlow.termination,'PENDING')
 const first=await candidateProof(begin.id);await actor.client.request(`${prefix}/attempts/${begin.id}/form-sections/${begin.currentItem.id}/submit`,'POST',formBody(begin))
 const ended=await actor.client.request(`${prefix}/attempts/${begin.id}`),proof=await candidateProof(begin.id),child=await children(begin.id)
 assert.equal(ended.status,'COMPLETED');assert.equal(proof.row.taskSatisfaction,'SATISFIED');assert.deepEqual(ended.trainingFlow.materials.map(row=>row.blockKey),['pending_not'])
 assert.deepEqual(proof.proof.path.skipped.map(row=>row.reason),['CONDITION_FALSE','CONDITION_FALSE','DEPENDENCY_SKIPPED','DEPENDENCY_SKIPPED'])
 assert.deepEqual([child.forms.length,child.scales.length,child.cognitive.length,child.sjt.length,child.snapshots.length],[1,0,0,0,1]);assert.deepEqual(proof.stable,first.stable)
 assert.equal((await readCognitiveQuota(prisma,actor.user.id,fixture.assignmentId)).usedAttempts,0)
 fixture.dependencyProduct=dependency;fixture.cases.push({name:'dependency_suppressed',attemptId:begin.id,user:actor.user,productId:dependency.id,termination:'COMPLETE',satisfaction:'SATISFIED',candidate:proof.stable});h.write('c19-fixture-private.json',fixture)
 h.check('Pending accepted-source NOT does not run early; skipped Form source suppresses entire NOT/IS_MISSING material and native conditions, without hidden child or quota admission')
 await drainReports(h,fixture.cases.filter(c=>c.name!=='fourtool').map(c=>c.attemptId))
 h.result.completed=fixture.cases.filter(c=>c.name!=='fourtool').map(({user,recovery,token,...safe})=>safe);h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
