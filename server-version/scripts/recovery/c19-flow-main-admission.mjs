/** First C19 production HTTP phase: real four-tool FINALs, late admission and
 * bounded negative probes. There is no browser or capacity qualification here. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {harness,drainReports,prisma,require,backend,children,candidateProof,census,noWrites,assertHidden,cognitiveFinal,readCognitiveQuota,decryptUnifiedRuntimePayload,denied,prefix,pub,products,sha} from './c19-flow-client.mjs'
import {seed,logins,draftFour,mainConfig,publish,formBody} from './c19-flow-fixture.mjs'
const h=harness('main-admission');let error
try{
 const [role]=await prisma.$queryRawUnsafe('SELECT current_user AS name,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user')
 assert.equal(role.name,'eduk12_runtime');for(const key of ['rolsuper','rolcreatedb','rolcreaterole','rolbypassrls'])assert.equal(role[key],false)
 const prior=h.read('c19-prior-main-failed-result.json')
 assert.equal(prior.passed,false);assert.equal(prior.checks.length,1)
 const fixture=h.read('c19-fixture-private.json'),{teacher,student,otherTeacher,outsider}=await logins(h,fixture)
 const productsInDb=await prisma.compositeAssessment.findMany({where:{createdBy:fixture.users.teacher.id,name:'C19 four-tool flow'},include:{items:true}})
 assert.equal(productsInDb.length,1);assert.equal(productsInDb[0].status,'PUBLISHED');assert.ok(productsInDb[0].trainingFlowDigest);assert.equal(productsInDb[0].items.length,6)
 assert.equal(await prisma.compositeAssessmentAttempt.count({where:{compositeAssessmentId:productsInDb[0].id}}),0,'failed candidate hash transaction must leave no parent')
 const product=await teacher.request(`${products}/${productsInDb[0].id}`)
 assert.equal(product.id,fixture.product.id)
 h.result.priorProducer={phase:'main-continuation',resultSha256:'85130c16b9f095a92f92c5191df686def06e2c4d96050d157ec91d3ea316d676',reusedChecks:prior.checks,continuation:'Reuse original published definition and successful nonmember denial; retry rolled-back first admission only. No accepted FINAL exists.'}
 const quotaBefore=await readCognitiveQuota(prisma,fixture.users.student.id,fixture.assignmentId)
 assert.equal(quotaBefore.usedAttempts,0)
 let {attempt}=await student.request(`${prefix}/${product.id}/attempts`,'POST',{})
 let proof=await candidateProof(attempt.id);const immutable=proof.stable
 assert.equal(proof.slots.slots.length,4);assert.equal(proof.proof,null);assert.ok(attempt.trainingFlow.currentInstrumentKey)
 let child=await children(attempt.id);assert.deepEqual([child.forms.length,child.scales.length,child.cognitive.length,child.sjt.length,child.snapshots.length],[1,0,0,0,0])
 assert.equal((await readCognitiveQuota(prisma,fixture.users.student.id,fixture.assignmentId)).usedAttempts,0)
 assert.equal(attempt.currentItem.type,'FORM_SECTION');assert.equal(attempt.trainingFlow.termination,'PENDING');assert.deepEqual(attempt.trainingFlow.materials.map(material=>material.blockKey),['intro']);assertHidden(attempt,product,['FORM'])
 const list=await student.request('/questionnaire-products/available');assert.ok(!JSON.stringify(list).includes(product.items.find(item=>item.type==='COGNITIVE').id))
 const hidden=type=>product.items.find(item=>item.type===type),sjtRoute=`${prefix}/attempts/${attempt.id}/items/${hidden('SITUATIONAL').id}/situational/${randomUUID()}`
 await noWrites(h,'Future tool whole/native/media probes leave all persistence counts unchanged',async()=>{
  await student.request(`${prefix}/attempts/${attempt.id}/whole/definition`,'GET',undefined,denied)
  await student.request(`${prefix}/attempts/${attempt.id}/whole/submit`,'POST',{submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,slotSetHash:proof.row.frozenActiveSlotSetHash,contextSnapshotHash:attempt.contextSnapshotHash,units:[]},denied)
  await student.request(`${prefix}/attempts/${attempt.id}/items/${hidden('SCALE').id}/scale/submit`,'POST',{submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:'0'.repeat(64),contextSnapshotHash:attempt.contextSnapshotHash,answers:[{itemCode:'mixed-scale-item-1',responseValue:'yes'}]},denied)
  await student.request('/cognitive/sessions','POST',{assignmentId:hidden('COGNITIVE').cognitiveAssignmentId},denied)
  await student.request(sjtRoute,'GET',undefined,denied)
  await student.request(sjtRoute+'/submit','POST',{submissionId:randomUUID(),attemptEpoch:1,definitionHash:'0'.repeat(64),compiledRuntimeHash:'0'.repeat(64),scoringVersion:'1',responseProtocol:'sjt-online-response-v1',responses:fixture.sjtResponses},denied)
  for(const route of [`${prefix}/attempts/${attempt.id}/items/${hidden('SCALE').id}/scale/assets/${fixture.sjt.asset.assetId}/content`,sjtRoute+`/assets/${fixture.sjt.asset.assetId}/content`,sjtRoute+'/scenes/sjt_q_first/video-sources'])await student.request(route,'GET',undefined,denied)
  await student.request(`${prefix}/attempts/${attempt.id}/items/${hidden('SCALE').id}/scale/items/mixed-scale-item-1/video-capability`,'POST',{},denied)
 })
 assert.deepEqual((await candidateProof(attempt.id)).stable,immutable)
 h.result.measurements.push({stage:'FIRST_FORM_ONLY',candidate:immutable,quotaBefore,quotaAfter:await readCognitiveQuota(prisma,fixture.users.student.id,fixture.assignmentId),children:{forms:1,scale:0,cognitive:0,sjt:0}})
 h.check('Full candidate/slotset are frozen once while first state/list expose only Form/material; future tools, whole and media cannot create children or consume Cognitive quota')
 const steps=[]
 for(const expected of ['FORM_SECTION','SCALE','COGNITIVE','SITUATIONAL']){
  const unit=attempt.currentItem;assert.equal(unit.type,expected);const before=await children(attempt.id)
  let route,body
  if(expected==='FORM_SECTION'){route=`${prefix}/attempts/${attempt.id}/form-sections/${unit.id}/submit`;body=formBody(attempt)}
  else if(expected==='SCALE'){assert.equal(before.scales.length,1);await student.request(`/scales/assessments/${before.scales[0].id}`);route=`/scales/assessments/${before.scales[0].id}/submit`;body={submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:unit.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,answers:[{itemCode:'mixed-scale-item-1',responseValue:'yes',responseTimeMs:17}]}}
  else if(expected==='COGNITIVE'){assert.equal(before.cognitive.length,1);const session=unit.cognitiveSession;assert.equal(session.config.totalTrials,120);await student.request(`/cognitive/sessions/${session.sessionId}`);route=`/cognitive/sessions/${session.sessionId}/submit`;body=cognitiveFinal(session)}
  else {assert.equal(before.sjt.length,1);route=`${prefix}/attempts/${attempt.id}/items/${unit.id}/situational/${unit.situationalAttemptId}`;const runtime=await student.request(route);assert.equal(runtime.instrument.online.responseProtocol,'sjt-online-response-v1');assert.ok(!JSON.stringify(runtime.instrument.online).includes('contributions'));assert.deepEqual(await student.request(route+`/assets/${fixture.sjt.asset.assetId}/content`,'GET',undefined,200,true),Buffer.from(fixture.sjt.imageBase64,'base64'));body={submissionId:randomUUID(),attemptEpoch:runtime.attempt.attemptEpoch,definitionHash:runtime.attempt.definitionHash,compiledRuntimeHash:runtime.attempt.compiledRuntimeHash,scoringVersion:runtime.attempt.scoringVersion,responseProtocol:'sjt-online-response-v1',responses:fixture.sjtResponses};route+='/submit'}
  await student.request(route,'POST',body)
  const accepted=await children(attempt.id);assert.equal(accepted.snapshots.length,steps.length+1)
  assert.equal((await student.request(route,'POST',body)).replayed,true)
  assert.deepEqual((await children(attempt.id)).snapshots,accepted.snapshots)
  attempt=await student.request(`${prefix}/attempts/${attempt.id}`)
  proof=await candidateProof(attempt.id);assert.ok(proof.proof,'first and subsequent accepted FINAL must persist the path proof');assert.deepEqual(proof.stable,immutable)
  child=await children(attempt.id)
  const expectedCounts=expected==='FORM_SECTION'?[1,1,0,0]:expected==='SCALE'?[1,1,1,0]:[1,1,1,1]
  assert.deepEqual([child.forms.length,child.scales.length,child.cognitive.length,child.sjt.length],expectedCounts)
  const quota=await readCognitiveQuota(prisma,fixture.users.student.id,fixture.assignmentId);assert.equal(quota.usedAttempts,expected==='FORM_SECTION'?0:1)
  if(expected==='FORM_SECTION'){assert.equal(attempt.currentItem.type,'SCALE');assert.deepEqual(attempt.trainingFlow.materials.map(material=>material.blockKey),['intro','typed_material']);assertHidden(attempt,product,['FORM','SCALE'])}
  if(expected==='SCALE')assertHidden(attempt,product,['FORM','SCALE','COGNITIVE'])
  steps.push({type:expected,submissionId:body.submissionId,canonicalSnapshotCount:child.snapshots.length,childCounts:expectedCounts,quotaUsed:quota.usedAttempts,pathHash:proof.row.trainingFlowPathHash,termination:proof.proof.path.termination})
 }
 assert.equal(attempt.status,'COMPLETED');assert.equal(attempt.currentItem,null);assert.equal(proof.row.taskSatisfaction,'SATISFIED');assert.equal(proof.proof.path.termination,'COMPLETE');assert.equal(child.snapshots.length,4);assert.equal(child.jobs.length,1)
 assert.deepEqual(child.snapshots.map(row=>row.unitType).sort(),['COGNITIVE','FORM_SECTION','SCALE','SITUATIONAL'])
 const raw=await prisma.cognitiveRawSubmission.findFirstOrThrow({where:{sessionId:child.cognitive[0].id}});assert.equal(raw.trialCount,120);assert.equal(decryptUnifiedRuntimePayload(raw.payloadEncrypted).trials.length,120)
 assert.equal(await prisma.situationalRawSubmission.count({where:{attemptId:child.sjt[0].id}}),1)
 await noWrites(h,'Accepted FINAL rejects restart and client satisfaction override',async()=>{await student.request(`${prefix}/attempts/${attempt.id}/restart`,'POST',{},409);await student.request(`${prefix}/attempts/${attempt.id}/whole/submit`,'POST',{taskSatisfaction:'SATISFIED',termination:'COMPLETE_EARLY'},denied)})
 fixture.cases.push({name:'fourtool',attemptId:attempt.id,user:fixture.users.student,productId:product.id,termination:'COMPLETE',satisfaction:'SATISFIED',steps,candidate:immutable});h.write('c19-fixture-private.json',fixture)
 h.result.completed=fixture.cases.map(({user,recovery,token,...safe})=>safe);h.result.measurements.push({stage:'FOURTOOL_COMPLETED',candidate:immutable,steps,quotaAfter:await readCognitiveQuota(prisma,fixture.users.student.id,fixture.assignmentId)})
 h.check('Real typed Form→native Scale→120-trial Cognitive→online SJT FINAL/replay creates exactly four facts and one outbox; state GET finalizes parent, late quota charged once and candidate ciphertext stays unchanged')
 await drainReports(h,[attempt.id])
 h.result.qualification={browser:false,capacity:false,media:'Successful selected SJT image bytes; denied future parent-media/video paths. No selected-video capability claim.',sql:'API process-wide SQL windows, not round-trip or per-request attribution under concurrency'}
 h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
