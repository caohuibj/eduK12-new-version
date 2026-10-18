/** Minimal real-HTTP checks for the already-created, independent C14 whole fixture.
 * No attempt/allocation/answer is fabricated. Temporary corruption affects only
 * this new product's publication markers before its first ACK, restored finally.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {randomUUID,createHash} from 'node:crypto'
const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../backend')
const require=createRequire(path.join(backend,'package.json'))
const {Prisma}=require('@prisma/client')
const {decryptUnifiedRuntimePayload}=require(path.join(backend,'dist/modules/assessment-runtime/security.js'))
const {isCompactEncryptedField,decryptCompactField}=require(path.join(backend,'dist/modules/assessment-runtime/compact-field-codec.js'))
const {publicTemplates}=require(path.join(backend,'dist/modules/assessment-runtime/public-templates.js'))
const {loadStoredCanonicalUnitResult,resolveStoredScaleAnswers}=require(path.join(backend,'dist/modules/assessment-runtime/compact-assessment-storage.js'))
const hash=value=>createHash('sha256').update(JSON.stringify(value,(_k,v)=>typeof v==='bigint'?String(v):v)).digest('hex')
const requiredFlags=['ASSESSMENT_COMPACT_FACTS_ENABLED','ASSESSMENT_SHARED_CONTROL_ENABLED','ASSESSMENT_REPORT_COMPACT_READ_ENABLED','ASSESSMENT_REPORT_COMMITTED_CONTEXT_ENABLED','ASSESSMENT_SCALE_COLLECTION_BATCH_ENABLED','ASSESSMENT_REPORT_CONTEXT_REUSE_ENABLED']

const assertFlags=()=>{
 for(const key of requiredFlags)assert.equal(process.env[key],'true',key)
 for(const key of ['ASSESSMENT_WHOLE_ATOMIC_RECEIPT_ENABLED','ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED'])assert.equal(process.env[key],'false',key)
}
const noPrivateOrHidden=(value,product,fact)=>{
 const text=JSON.stringify(value)
 for(const hidden of product.items.filter(item=>!fact.value.selectedItemIds.includes(item.id))){
  assert.ok(!text.includes(hidden.id),'Public selected plan leaked an outside-group item')
  if(hidden.scaleId)assert.ok(!text.includes(hidden.scaleId),'Public selected plan leaked an outside-group Scale')
 }
 for(const privateValue of [fact.row.id,fact.row.participantKey,fact.row.userId,fact.row.recoveryTokenHash,...fact.scales.map(row=>row.id)].filter(Boolean))assert.ok(!text.includes(privateValue),'Public plan contains a private identity')
 for(const field of ['trainingVariant','allocationHash','allocationEncrypted','participantKey','variantKey','principal','recoveryTokenHash','assessmentId','userId'])assert.ok(!text.includes('"'+field),'Public plan contains private allocation/ownership data')
}

export async function verifyWholeSharedBeforeAck({prisma,client,attempt,product,fact,definition,body,noWrites,check}){
 assertFlags()
 assert.equal(product.items.length,2);assert.ok(product.items.every(item=>item.type==='SCALE'))
 assert.equal(fact.scales.length,1);assert.equal(fact.value.selectedItemIds.length,1)
 assert.equal(isCompactEncryptedField(fact.row.trainingVariantAllocationEncrypted),true,'Private allocation uses compact authenticated encryption')
 assert.equal(decryptUnifiedRuntimePayload(fact.row.trainingVariantAllocationEncrypted).k,undefined,'Allocation is private, not a shared public template reference')
 assert.deepEqual(definition.units.map(unit=>unit.itemId),fact.value.selectedItemIds)
 const publicDefinition=JSON.stringify(definition)
 for(const hidden of product.items.filter(item=>!fact.value.selectedItemIds.includes(item.id)))assert.ok(!publicDefinition.includes(hidden.id))
 for(const field of ['trainingVariantAllocation','participantKey','variantKey','trainingVariantFrozen'])assert.ok(!publicDefinition.includes(field))
 const freshChild=await prisma.assessment.findUniqueOrThrow({where:{id:fact.scales[0].id}})
 const jobWhere={attemptId_attemptEpoch:{attemptId:attempt.id,attemptEpoch:attempt.attemptEpoch}}
 const job=await prisma.compositeReportJob.findUniqueOrThrow({where:jobWhere})
 assert.equal(job.wholeSubmissionId,null);assert.equal(job.wholeAcceptedAt,null)
 const slotRef=decryptUnifiedRuntimePayload(fact.row.frozenActiveSlotSetEncrypted)
 const validationRef=decryptUnifiedRuntimePayload(job.wholeValidationEncrypted)
 const admissionRef=decryptUnifiedRuntimePayload(freshChild.frozenAdmissionSnapshotEncrypted)
 assert.equal(slotRef.k,'FSP2');assert.equal(validationRef.k,'WVP2');assert.equal(admissionRef.k,'UAR2')
 const [slotPlan,validationPlan,admissionPlan]=await publicTemplates.loadMany([
  {hash:slotRef.p,kind:'FROZEN_SLOT_PLAN'},{hash:validationRef.p,kind:'WHOLE_VALIDATION_PLAN'},{hash:admissionRef.p,kind:'UNIT_ADMISSION_PLAN'},
 ])
 for(const plan of [slotPlan,validationPlan,admissionPlan])noPrivateOrHidden(plan,product,fact)
 assert.equal(slotPlan.slots.length,1);assert.deepEqual(validationPlan.units.map(unit=>unit.itemId),fact.value.selectedItemIds)
 assert.equal(validationRef.b.attemptId,attempt.id);assert.equal(validationRef.u.length,1);assert.equal(validationRef.u[0][0],freshChild.id)
 const rows=await prisma.assessmentPublicTemplate.findMany({where:{templateHash:{in:[slotRef.p,validationRef.p,admissionRef.p]}}})
 assert.equal(rows.length,3);assert.ok(rows.every(row=>isCompactEncryptedField(row.payloadEncrypted)))
 check('Real compact/shared storage: private encrypted allocation, selected-only FSP2/UAR2/WVP2 plans, no public allocation or participant identity')

 const evidenceBefore=async()=>({
  parent:await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attempt.id}}),
  job:await prisma.compositeReportJob.findUniqueOrThrow({where:jobWhere}),
  children:await prisma.assessment.findMany({where:{compositeAttemptId:attempt.id},orderBy:{id:'asc'}}),
  facts:await prisma.assessmentResultFact.findMany({where:{assessmentId:freshChild.id}}),
  snapshots:await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:attempt.id},orderBy:{id:'asc'}}),
 })
 const before=hash(await evidenceBefore()),route=`/composite-assessments/attempts/${attempt.id}/whole/submit`
 const deny=async(name,payload,status)=>{
  await noWrites(name,()=>client.request(route,'POST',payload,status))
  assert.equal(hash(await evidenceBefore()),before,'Rejected cached whole input changed a receipt, allocation, child, or accepted fact')
 }
 const hidden=product.items.find(item=>!fact.value.selectedItemIds.includes(item.id))
 await deny('Cached whole rejects client-forged allocation/group fields before ACK',{...body,submissionId:randomUUID(),trainingVariantAllocation:{variantKey:hidden.id,allocationHash:'0'.repeat(64)}},400)
 await deny('Cached whole rejects missing selected units before ACK',{...body,submissionId:randomUUID(),units:[]},400)
 await deny('Cached whole rejects replacing the selected unit with a real outside-group item before ACK',{...body,submissionId:randomUUID(),units:[{...body.units[0],itemId:hidden.id}]},409)
 await deny('Cached whole rejects adding a real outside-group unit before ACK',{...body,submissionId:randomUUID(),units:[...body.units,{...body.units[0],itemId:hidden.id}]},400)
 const original=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:product.id}})
 assert.equal(await prisma.compositeAssessmentAttempt.count({where:{compositeAssessmentId:product.id}}),1,'Marker corruption is restricted to the independent new whole product')
 const restore={trainingVariantDraft:original.trainingVariantDraft??Prisma.DbNull,trainingVariantFrozen:original.trainingVariantFrozen??Prisma.DbNull,trainingVariantDigest:original.trainingVariantDigest,updatedAt:original.updatedAt}
 try{
  // Both nullable-pair columns change together, obeying the production CHECK.
  // The immutable allocation is never written, even for a negative fixture.
  await prisma.compositeAssessment.update({where:{id:product.id},data:{trainingVariantDraft:Prisma.DbNull,trainingVariantFrozen:Prisma.DbNull,trainingVariantDigest:null}})
  await deny('Cached whole rejects missing publication markers despite retained valid private allocation, before ACK',body,403)
  await prisma.compositeAssessment.update({where:{id:product.id},data:{...restore,trainingVariantDigest:original.trainingVariantDigest==='f'.repeat(64)?'e'.repeat(64):'f'.repeat(64)}})
  await deny('Cached whole rejects mismatched publication/allocation digest before ACK',body,403)
 }finally{
  await prisma.compositeAssessment.update({where:{id:product.id},data:restore})
  assert.deepEqual(await prisma.compositeAssessment.findUniqueOrThrow({where:{id:product.id}}),original,'Synthetic whole publication metadata must be fully restored')
 }
 assert.equal(hash(await evidenceBefore()),before)
 return {attemptId:attempt.id,selectedItemIds:fact.value.selectedItemIds,publicPlanHashes:[slotRef.p,validationRef.p,admissionRef.p],unacceptedFactsSha256:before,receiptMode:'TRANSACTIONAL',flags:Object.fromEntries(requiredFlags.map(key=>[key,process.env[key]]))}
}

export async function verifyWholeSharedAfterReport({prisma,attempt,product,fact,body,check,state,status}){
 assertFlags()
 const parent=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attempt.id}})
 const job=await prisma.compositeReportJob.findUniqueOrThrow({where:{attemptId_attemptEpoch:{attemptId:attempt.id,attemptEpoch:attempt.attemptEpoch}}})
 assert.equal(parent.status,'COMPLETED');assert.equal(job.status,'READY');assert.equal(job.wholeSubmissionId,body.submissionId);assert.equal(job.attemptCount,1,'Fresh optimized whole must complete in its first worker execution')
 assert.ok(job.wholeAcceptedAt);assert.ok(isCompactEncryptedField(job.wholeAnswersEncrypted));assert.equal(parent.trainingVariantAllocationEncrypted,fact.row.trainingVariantAllocationEncrypted)
 const stored=await prisma.assessmentResultFact.findMany({where:{assessmentId:{in:fact.scales.map(child=>child.id)}}})
 assert.equal(stored.length,1)
 for(const row of stored){assert.equal(row.rawReceiptAttemptId,attempt.id);assert.equal(row.rawAnswersEncrypted,null);assert.equal(row.attemptEpoch,attempt.attemptEpoch);assert.ok(isCompactEncryptedField(row.factsEncrypted))}
 const snapshots=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:attempt.id,attemptEpoch:attempt.attemptEpoch}})
 assert.equal(snapshots.length,1);assert.equal(snapshots[0].unitType,'SCALE');assert.equal(snapshots[0].terminalState,'COMPLETED')
 const ref=decryptUnifiedRuntimePayload(snapshots[0].canonicalResultEncrypted);assert.equal(ref.k,'SCF2');assert.equal(ref.a,stored[0].assessmentId);assert.equal(ref.e,attempt.attemptEpoch)
 const canonical=await loadStoredCanonicalUnitResult(snapshots[0].canonicalResultEncrypted,prisma)
 assert.equal(canonical.resultHash,stored[0].canonicalResultHash)
 const child=await prisma.assessment.findUniqueOrThrow({where:{id:stored[0].assessmentId}})
 assert.deepEqual(child.answers,{k:'SFR1',e:attempt.attemptEpoch});assert.deepEqual(child.result,{k:'SFF1',e:attempt.attemptEpoch})
 const raw=await resolveStoredScaleAnswers(child.answers,child,prisma)
 assert.deepEqual(raw.answers.map(({itemCode,responseValue})=>({itemCode,responseValue})),body.units[0].answers)
 const compactReport=decryptCompactField(job.reportEncrypted);assert.equal(compactReport.kind,'COMPOSITE_REPORT_FACTS');assert.equal(compactReport.binding.attemptId,attempt.id);assert.equal(compactReport.binding.attemptEpoch,attempt.attemptEpoch);assert.deepEqual(compactReport.units.map(unit=>unit.assessmentId),[child.id])
 const [layout]=await publicTemplates.loadMany([{hash:compactReport.layout,kind:'COMPOSITE_REPORT_LAYOUT'}]);assert.equal(layout.root.assessmentId,product.id);const {assessmentId:publicProductId,...publicRoot}=layout.root;noPrivateOrHidden({...layout,root:publicRoot},product,fact)
 const timeline=await verifiedWorkerTimeline(state,status,attempt.id)
 check('Legal selected-only whole ACK completed through original worker with compact receipt-backed Scale fact and canonical SCF2; direct worker batch and committed-graph timeline verified; transactional receipt retained')
 return {attemptId:attempt.id,wholeSubmissionId:body.submissionId,canonicalResultHash:canonical.resultHash,compactScaleFacts:stored.length,privateAllocationUnchanged:true,jobAttemptCount:job.attemptCount,requestedRevision:job.requestedRevision,claimedRevision:job.claimedRevision,timeline}
}

async function verifiedWorkerTimeline(state,status,attemptId){
 assert.equal(process.env.PERF_ISOLATED_TEST_MODE,'1');assert.equal(process.env.ASSESSMENT_TIMELINE_ENABLED,'true')
 const attemptHash=createHash('sha256').update(attemptId).digest('hex').slice(0,24),file=path.join(state,'report-worker.log'),deadline=Date.now()+5000
 while(Date.now()<deadline){
  const records=fs.readFileSync(file,'utf8').split('\n').flatMap(line=>{const at=line.indexOf('ASSESSMENT_TIMELINE ');if(at<0)return [];try{return [JSON.parse(line.slice(at+'ASSESSMENT_TIMELINE '.length))]}catch{return []}})
  const matches=records.filter(record=>record.kind==='report'&&record.attemptHash===attemptHash&&record.processId===status.pids['report-worker'])
  const ready=matches.filter(record=>record.events.some(event=>event.name==='report.ready_commit_confirmed'))
  if(ready.length){
   assert.equal(ready.length,1);const record=ready[0],names=record.events.map(event=>event.name)
   assert.equal(record.dropped,0);assert.equal(record.terminal,'returned');assert.ok(names.includes('report.units_batch'));assert.ok(names.includes('report.aggregate_finalize'));assert.ok(names.includes('report.aggregate_materialize'));assert.ok(names.includes('aggregate.validate'));assert.ok(!names.includes('aggregate.definition_db'),'Fresh whole report must reuse its committed parent graph rather than reload the graph')
   return {attemptHash,processId:record.processId,events:names,dropped:record.dropped,terminal:record.terminal,evidence:'Existing worker timeline proves batch execution and committed-parent graph reuse; no CPU, latency, or throughput conclusion'}
  }
  await new Promise(resolve=>setTimeout(resolve,25))
 }
 throw new Error('Original worker did not emit the complete optimized whole timeline')
}
