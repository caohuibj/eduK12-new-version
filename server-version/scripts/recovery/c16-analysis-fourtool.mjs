/** New synthetic sources copied from one C14 accepted selected four-tool case.
 * Scientific definitions/results and canonical core hashes are retained. Only
 * synthetic persistence IDs change; no scorer and no FINAL endpoint is called.
 * C14's text Form is not numeric: a separately seeded typed NUMBER replaces it.
 */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../backend'),require=createRequire(path.join(backend,'package.json'))
const {canonicalHash}=require(path.join(backend,'dist/modules/assessment-runtime/canonical.js'))
const {decryptUnifiedRuntimePayload,encryptUnifiedRuntimePayload}=require(path.join(backend,'dist/modules/assessment-runtime/security.js'))
const {loadFrozenActiveSlotSet,createFrozenActiveSlotSet}=require(path.join(backend,'dist/modules/assessment-runtime/slot-set.js'))
const {parseCanonicalUnitResultEnvelope}=require(path.join(backend,'dist/modules/assessment-runtime/unit-result.js'))
const {loadScaleResult,loadScaleAnswers,encryptScaleAnswers}=require(path.join(backend,'dist/modules/scale/scale-workflow.service.js'))
const {loadStoredCanonicalUnitResult}=require(path.join(backend,'dist/modules/assessment-runtime/compact-assessment-storage.js'))
const {prepareCompactScaleFacts,decodeScaleFacts}=require(path.join(backend,'dist/modules/assessment-runtime/compact-scale-facts.js'))
const {readFrozenReport}=require(path.join(backend,'dist/modules/cognitive/profile-freeze.js'))

export async function attachFourToolSources(prisma,fixture,original){
 const parent=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:original.attemptId}})
 assert.equal(parent.status,'COMPLETED');assert.equal(parent.attemptEpoch,1)
 const task=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:parent.compositeAssessmentId},include:{items:true}})
 const snapshots=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:parent.id}})
 assert.deepEqual(snapshots.map(row=>row.unitType).sort(),['COGNITIVE','FORM_SECTION','SCALE','SITUATIONAL'])
 const slots=await loadFrozenActiveSlotSet(parent.frozenActiveSlotSetEncrypted,prisma),units=[]
 for(const type of ['SCALE','COGNITIVE','SITUATIONAL']){
  const item=task.items.find(row=>row.type===type&&original.selectedItemIds.includes(row.id)),snapshot=snapshots.find(row=>row.unitType===type)
  assert.ok(item&&snapshot);assert.equal(snapshot.attemptEpoch,1);const envelope=await loadStoredCanonicalUnitResult(snapshot.canonicalResultEncrypted,prisma),slot=slots.slots.find(row=>row.slotKey===snapshot.slotKey)
  assert.ok(slot);let child,raw,result,answers,metric
  if(type==='SCALE'){
   child=await prisma.assessment.findUniqueOrThrow({where:{id:snapshot.sourceAttemptId}})
   const loaded=await loadScaleResult(child.result,child,{full:true},prisma),loadedAnswers=await loadScaleAnswers(child.answers,child,prisma)
   assert.equal(loaded.decryptError,false);assert.equal(loadedAnswers.decryptError,false);assert.ok(loaded.result&&loadedAnswers.answers.length)
   result=loaded.result;answers=loadedAnswers.answers;metric=envelope.core.metrics.find(row=>row.key==='total');assert.equal(metric.value,1)
  }else if(type==='COGNITIVE'){
   child=await prisma.cognitiveSession.findUniqueOrThrow({where:{id:snapshot.sourceAttemptId}})
   raw=await prisma.cognitiveRawSubmission.findFirstOrThrow({where:{sessionId:child.id}});assert.equal(raw.trialCount,120)
   const assignment=await prisma.cognitiveAssignment.findUniqueOrThrow({where:{id:item.cognitiveAssignmentId}}),report=readFrozenReport(assignment.resolvedReportSnapshotEncrypted)
   metric=envelope.core.metrics.find(row=>{const definition=report?.metricDefinitions?.[row.key];return typeof row.value==='number'&&definition&&['number','integer'].includes(definition.valueType)&&definition.role!=='research_only'&&(!definition.availableProfiles||definition.availableProfiles.includes('standard'))&&!['productIndex','product_index'].includes(row.key)})
   assert.ok(metric)
  }else{
   child=await prisma.situationalAttempt.findUniqueOrThrow({where:{id:snapshot.sourceAttemptId}});raw=await prisma.situationalRawSubmission.findUniqueOrThrow({where:{attemptId:child.id}})
   metric=envelope.core.metrics.find(row=>row.key==='cooperation');assert.equal(metric.value,9)
  }
  units.push({type,item,snapshot,envelope,slot,child,raw,result,answers,metricKey:metric.key,value:metric.value})
 }
 assert.equal(new Set(['c16_numeric_value',...units.map(unit=>unit.metricKey)]).size,4)
 fixture.fourTool={label:'SYNTHETIC_COPIES_OF_C14_ACCEPTED_NUMERIC_FACTS_NOT_NEW_RESPONSES',originalParentId:parent.id,contextHash:parent.contextSnapshotHash,contextEncrypted:parent.contextSnapshotEncrypted,respondentType:parent.respondentType,units,originalCoreHashes:Object.fromEntries(units.map(unit=>[unit.type,unit.envelope.resultHash]))}
 fixture.constantMetrics=Object.fromEntries(units.map(unit=>[unit.metricKey,unit.value]))
 for(const wave of fixture.waves){
  wave.extraItems=[]
  for(const [index,unit]of units.entries()){
   const item=await prisma.compositeAssessmentItem.create({data:{compositeAssessmentId:wave.task.id,type:unit.type,position:index+1,required:true,...(unit.type==='SCALE'?{scaleId:unit.item.scaleId}:unit.type==='COGNITIVE'?{cognitiveAssignmentId:unit.item.cognitiveAssignmentId}:{situationalInstrumentKey:unit.item.situationalInstrumentKey,situationalInstrumentVersion:unit.item.situationalInstrumentVersion})}})
   wave.extraItems.push({type:unit.type,id:item.id,metricKey:unit.metricKey,value:unit.value})
  }
  wave.slots=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[...wave.slots.slots,...units.map((unit,index)=>({...unit.slot,slotKey:unit.type.toLowerCase()+':'+wave.extraItems[index].id,sourceBinding:{...unit.slot.sourceBinding,compositeItemId:wave.extraItems[index].id}}))]})
  fixture.selector.waves[wave.index].metrics.push(...wave.extraItems.map(item=>({itemId:item.id,metricKey:item.metricKey})))
 }
}

export async function addCopiedFourToolFacts(prisma,fixture,users){
 const source=fixture.fourTool
 for(const user of users)for(const wave of fixture.waves){
  const parent=fixture.attempts.find(row=>row.userId===user.id&&row.waveIndex===wave.index);assert.ok(parent)
  for(const unit of source.units){
   const item=wave.extraItems.find(row=>row.type===unit.type),id=randomUUID(),submissionId=randomUUID(),slotKey=unit.type.toLowerCase()+':'+item.id
   const envelope=parseCanonicalUnitResultEnvelope({...unit.envelope,persistenceProvenance:{...unit.envelope.persistenceProvenance,sourceAttemptId:id,sourceSubmissionId:submissionId}})
   assert.equal(envelope.resultHash,source.originalCoreHashes[unit.type]);assert.equal(canonicalHash(envelope.core),unit.envelope.resultHash)
   const canonicalResultEncrypted=encryptUnifiedRuntimePayload(envelope)
   if(unit.type==='SCALE'){
    const binding={assessmentId:id,attemptEpoch:1,submissionId,payloadHash:unit.child.submissionPayloadHash}
    const factsEncrypted=await prepareCompactScaleFacts({result:unit.result,itemOrder:unit.result.itemScores.map(row=>row.itemCode),binding,canonical:envelope}),facts=decodeScaleFacts(factsEncrypted)
    assert.equal(facts.sourceResultHash,unit.envelope.bundleBridge?.sourceResultHash??canonicalHash(unit.result))
    await prisma.assessment.create({data:{id,scaleId:unit.child.scaleId,userId:user.id,subjectUserId:user.id,respondentUserId:user.id,respondentType:unit.child.respondentType,status:'COMPLETED',deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,submissionId,submissionPayloadHash:binding.payloadHash,submissionCompletedAt:unit.snapshot.completedAt,answers:{k:'SFR1',e:1},result:{k:'SFF1',e:1},runtimeSnapshotEncrypted:unit.child.runtimeSnapshotEncrypted,compiledRuntimeHash:unit.child.compiledRuntimeHash,progress:100,completedAt:unit.snapshot.completedAt,totalTime:unit.child.totalTime,compositeAttemptId:parent.id,compositeItemId:item.id}})
    await prisma.assessmentResultFact.create({data:{assessmentId:id,attemptEpoch:1,submissionId,payloadHash:binding.payloadHash,sourceResultHash:facts.sourceResultHash,canonicalResultHash:envelope.resultHash,factsEncrypted,rawAnswersEncrypted:encryptScaleAnswers(unit.answers),rawReceiptAttemptId:null,completedAt:unit.snapshot.completedAt,totalTime:unit.child.totalTime??0}})
   }else if(unit.type==='COGNITIVE'){
    await prisma.cognitiveSession.create({data:{...unit.child,id,userId:user.id,participantKey:'c16-synthetic:'+user.id,compositeAttemptId:parent.id,compositeItemId:item.id,attemptNo:wave.index+1,accessTokenId:null,recoveryTokenHash:null,anonymousCode:null,participantSnapshotEncrypted:null,frozenAdmissionSnapshotEncrypted:null,frozenAdmissionSnapshotHash:null,submissionId,completionKey:randomUUID()}})
    await prisma.cognitiveRawSubmission.create({data:{...unit.raw,id:randomUUID(),sessionId:id}})
   }else{
    await prisma.situationalAttempt.create({data:{...unit.child,id,userId:user.id,participantKey:'c16-synthetic:'+user.id,compositeAttemptId:parent.id,compositeItemId:item.id,compositeSlotKey:slotKey,submissionId,canonicalResultEncrypted}})
    await prisma.situationalRawSubmission.create({data:{...unit.raw,id:randomUUID(),attemptId:id}})
   }
   await prisma.assessmentUnitSnapshot.create({data:{...unit.snapshot,id:randomUUID(),compositeAttemptId:parent.id,slotKey,sourceAttemptId:id,sourceSubmissionId:submissionId,canonicalResultEncrypted:fixture.poisonUnitType===unit.type?'C16_SYNTHETIC_UNSELECTED_POISON':canonicalResultEncrypted}})
   parent.metrics??={c16_numeric_value:parent.value};parent.metrics[unit.metricKey]=unit.value
  }
 }
}
