/** C25 preparation: fresh resources, one IMMEDIATE whole FINAL, scheduled draft.
 * No services, migrations, old checkpoint reads, maintenance cleanup or old FINALs. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {harness,runtime,prefix,receiptRoute,reportBaseline,terminalFacts,assertTerminalBatch,acceptedFacts} from './c25-client.mjs'
import {seed,actors,draftProduct,publish,startAuthenticated,retain,saveCheckpoint,markTombstones,persist,attemptRoute,scaleAnswers} from './c25-fixture.mjs'
const h=await harness('prepare',300);let error
try{
 const {prisma,drainReports}=await runtime(),f=await seed(h),a=await actors(h,f)
 h.check('Five new synthetic actors, Training enrollment, definition-only clones and formally reviewed/granted online SJT')
 let p=await draftProduct(a.teacher,f,{name:'A immediate whole Scale'});p=await publish(a.teacher,p);f.products.A=p;persist(h,f)
 const publication=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:p.id}})
 assert.deepEqual(publication.trainingFeedbackPolicy,{schemaVersion:1,mode:'IMMEDIATE'})
 assert.equal(publication.trainingPersistencePolicy.localCognitive,null)
 const baseline=await reportBaseline();h.write('c25-prepare-baseline-private.json',baseline)
 const x=await startAuthenticated(a.student,p);await retain(h,f,'A',x,'IMMEDIATE');await saveCheckpoint(h,f,'A',x)
 const definition=await x.client.request(attemptRoute(x)+'/whole/definition');assert.equal(definition.units.length,1)
 const body={submissionId:randomUUID(),attemptEpoch:definition.attemptEpoch,slotSetHash:definition.slotSetHash,contextSnapshotHash:definition.contextSnapshotHash,units:definition.units.map(unit=>({itemId:unit.itemId,definitionHash:unit.definitionHash,answers:scaleAnswers(unit.scale.definition)}))}
 f.cases.A.wholeSubmissionId=body.submissionId;f.cases.A.wholeSubmissionBody=structuredClone(body);persist(h,f)
 const accepted=await x.client.request(attemptRoute(x)+'/whole/submit','POST',body);assert.equal(accepted.status,'ACCEPTED');assert.equal(accepted.replayed,false)
 const facts=await acceptedFacts(x.attempt.id),replay=await x.client.request(attemptRoute(x)+'/whole/submit','POST',body)
 assert.equal(replay.replayed,true);assert.deepEqual(await acceptedFacts(x.attempt.id),facts)
 const receipt=await x.client.request(receiptRoute(prefix,x.attempt.id,body.submissionId,body.attemptEpoch));assert.equal(receipt.status,'ACCEPTED');assert.equal(receipt.submissionId,body.submissionId)
 const before=await terminalFacts([x.attempt.id]);h.write('c25-prepare-before-drain-private.json',before)
 await drainReports(h,[x.attempt.id])
 const after=await terminalFacts([x.attempt.id]);h.write('c25-prepare-after-drain-private.json',after)
 assertTerminalBatch({baseline,before,after,expectedTypes:['SCALE'],whole:true});await markTombstones(h,f,['A'])
 const state=await x.client.request(attemptRoute(x));assert.equal(state.status,'COMPLETED')
 const status=await x.client.request(attemptRoute(x)+'/report-status');assert.equal(status.participantFeedback.state,'AVAILABLE');assert.equal(status.reportStatus.state,'READY')
 const report=await x.client.request(attemptRoute(x)+'/report');assert.ok(report.unitReports.some(unit=>unit.type==='SCALE'))
 const native=await x.client.request(`/scales/assessments/${f.cases.A.children.scaleId}`);assert.ok(['scores','full'].includes(native.report?.kind),'opened native Scale numeric report absent');assert.ok(native.report.scores?.length>0)
 const finalReceipt=await x.client.request(receiptRoute(prefix,x.attempt.id,body.submissionId,body.attemptEpoch));assert.equal(finalReceipt.status,'ACCEPTED');assert.equal(finalReceipt.reportStatus.state,'READY')
 const terminalReplayBaseline={terminal:await terminalFacts([x.attempt.id]),facts:await acceptedFacts(x.attempt.id)}
 const terminalReplay=await x.client.request(attemptRoute(x)+'/whole/submit','POST',f.cases.A.wholeSubmissionBody)
 assert.equal(terminalReplay.replayed,true);assert.equal(terminalReplay.status,'ACCEPTED');assert.equal(terminalReplay.submissionId,finalReceipt.submissionId);assert.equal(terminalReplay.payloadHash,finalReceipt.payloadHash)
 const replayReceipt=await x.client.request(receiptRoute(prefix,x.attempt.id,body.submissionId,body.attemptEpoch))
 // committedAt is the receipt read time; all durable receipt fields remain exact.
 const stableReceipt=({committedAt,...durable})=>durable
 assert.deepEqual(stableReceipt(replayReceipt),stableReceipt(finalReceipt))
 assert.deepEqual({terminal:await terminalFacts([x.attempt.id]),facts:await acceptedFacts(x.attempt.id)},terminalReplayBaseline,'completed whole replay changed accepted facts/jobs/checkpoint')
 h.result.measurements.push({case:'A',stage:'COMPLETED_WHOLE_FINAL_REPLAY',exactOriginalBody:true,durableReceiptUnchanged:true,acceptedFactsJobsCheckpointUnchanged:true})
 h.check('A default IMMEDIATE whole delivery/actual FINAL/exact replay/original receipt and single original outbox drain; checkpoint terminal wipe and positive report')
 f.products.scheduled=await draftProduct(a.teacher,f,{name:'B C D scheduled four-tool',four:true});f.resources.form=f.products.scheduled.formSections[0].id
 const scheduledRow=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:f.products.scheduled.id}});assert.equal(scheduledRow.status,'DRAFT');assert.equal(scheduledRow.publishedAt,null)
 persist(h,f);h.result.fixture={scope:f.scope,immediateAttemptId:f.cases.A.attemptId,scheduledDraftId:f.products.scheduled.id};h.result.passed=true
}catch(e){error=e}finally{await h.finish(error)}
