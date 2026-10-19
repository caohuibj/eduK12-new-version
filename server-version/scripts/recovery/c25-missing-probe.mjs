/** A single new authenticated Cognitive-only E publication and natural release.
 * No service is started by import; execution awaits a separately approved run. */
import assert from 'node:assert/strict'
import {readMissingPrerequisites,missingState} from './c25-missing-contract.mjs'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {harness,runtime,products,prefix,policy,pgNow,reportBaseline,terminalFacts,assertTerminalBatch,acceptedFacts,assertWithheld,assertWindow,persistenceMetadata,sha,publicFailure} from './c25-client.mjs'
import {publish,startAuthenticated,checkpointEnvelope} from './c25-fixture.mjs'
import {runConsumerChild,oldReadSnapshot} from './c25-missing-open.mjs'
import {immutableProbeIdentity,verifyProbeSource,consumerQualification} from './c25-missing-consumers.mjs'

export function assertProbeWindow(schedule,requests=[]){
 assert.equal(typeof schedule.t0,'string');assert.equal(typeof schedule.releaseAt,'string')
 assertWindow({...schedule,requests})
 if(schedule.closedFinishedAt){assert.ok(schedule.closedStartedAt);assert.ok(Date.parse(schedule.closedFinishedAt)<Date.parse(schedule.releaseAt))}
 if(schedule.observedOpenAt)assert.ok(schedule.closedFinishedAt,'Natural opening cannot substitute for a completed closed proof')
 return true
}
export function assertProbeFinal(body,session){
 assert.equal(session.config.totalTrials,120);assert.equal(body.trials.length,120)
 assert.equal(body.attemptEpoch,session.attemptEpoch);assert.equal(body.definitionHash,session.definitionHash)
 assert.equal(body.contextSnapshotHash,session.contextSnapshotHash);assert.equal(typeof body.submissionId,'string');assert.ok(body.submissionId)
 assert.equal(body.recoveryToken,undefined,'E is an authenticated student')
 return true
}
export async function probeHttpMatrix(h,f,student,closed){
 const {prisma}=await runtime(),c=f.case,base=`${prefix}/attempts/${c.attemptId}`,parent=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:c.attemptId}})
 const attempt=await student.request(base);assert.equal(attempt.status,'COMPLETED');assertWithheld(attempt)
 const status=await student.request(base+'/report-status');assert.equal(status.status,'COMPLETED');assert.equal(status.reportStatus.state,'READY');assert.equal(status.participantFeedback.releaseAt,f.schedule.releaseAt);assert.equal(status.participantFeedback.state,closed?'GENERATED_NOT_RELEASED':'AVAILABLE');assertWithheld(status)
 const report=await student.request(base+'/report','GET',undefined,closed?403:200)
 if(closed)assertWithheld(report);else {assert.deepEqual(report.unitReports.map(u=>u.type),['COGNITIVE']);assert.equal(report.backgroundValues.length,0)}
 const cognitive=await student.request(`/cognitive/sessions/${c.children.cognitiveSessionId}`);assert.deepEqual(cognitive.trainingPersistence,persistenceMetadata(parent))
 if(closed){assert.equal(cognitive.feedbackDeferred,true);assertWithheld(cognitive)}else{assert.notEqual(cognitive.feedbackDeferred,true);assert.ok(cognitive.result||cognitive.score!=null)}
 const history=await student.request('/cognitive/history');assert.equal(history.total,1);assert.equal(history.list.length,1);const row=history.list[0];assert.equal(row.sessionId,c.children.cognitiveSessionId)
 if(closed){assert.equal(row.feedbackDeferred,true);assert.equal(row.score,null);assert.equal(row.qualityState,null);assertWithheld(row)}else{assert.notEqual(row.feedbackDeferred,true);assert.ok(row.score!=null||row.qualityState!=null)}
 h.result.measurements.push({case:'E',stage:closed?'NEW_E_CLOSED_HTTP':'NEW_E_OPEN_HTTP',historyRows:1,completed:true,reportReady:true,feedback:status.participantFeedback.state})
}
async function main(){
 readMissingPrerequisites(process.argv[2])
 const h=await harness('missing-probe',600);let error,f
 try{
  assert.equal(h.read('c25-missing-open-result.json').passed,true)
  h.result.qualification={...h.result.qualification,scope:consumerQualification.scope,case:'E'}
  const originalBytes=fs.readFileSync(path.join(h.state,'c25-fixture-private.json')),old=JSON.parse(originalBytes),{prisma,loadFrozenActiveSlotSet,cognitiveFinal,drainReports,pause}=await runtime()
  const oldBefore=await oldReadSnapshot(old);h.write('c25-missing-probe-old-before-private.json',oldBefore)
  const source=await prisma.user.findUniqueOrThrow({where:{id:old.actors.student.id}}),id=randomUUID(),username='c25-probe-student-'+id
  const studentIdentity={id,username,password:old.actors.student.password,role:'STUDENT'}
  f={schemaVersion:1,scope:consumerQualification.scope,name:'E',originalFixtureSha256:sha(originalBytes),courseId:old.courseId,teacherId:old.actors.teacher.id,cognitiveAssignmentId:old.resources.cognitive,inheritedStudentId:old.actors.student.id,actors:{student:studentIdentity},product:null,case:null,schedule:null,restoreCases:[],checkpointCases:[]}
  assert.ok(!fs.existsSync(path.join(h.state,'c25-missing-probe-fixture-private.json')),'E preparation is single-use')
  const persist=()=>h.write('c25-missing-probe-fixture-private.json',f);persist()
  await prisma.user.create({data:{id,username,passwordHash:source.passwordHash,role:'STUDENT',accountDomain:'TRAINING',teacherApproved:true,mustChangePassword:false}})
  await prisma.courseStudent.create({data:{courseId:f.courseId,studentId:id,status:'ACTIVE'}})
  const teacher=h.client(),student=h.client();await teacher.login(old.actors.teacher,'TEACHER');await student.login(studentIdentity,'STUDENT')
  let p=await teacher.request(products,'POST',{requestId:randomUUID(),name:'C25 independent E Cognitive feedback probe',questionnaireType:'COURSE',courseIds:[f.courseId],publicEnabled:false,expiresAt:new Date(Date.now()+3600000).toISOString(),trainingPersistencePolicy:policy(true)})
  p=await teacher.request(`${products}/${p.id}/items`,'POST',{revision:p.revision,item:{type:'COGNITIVE',cognitiveAssignmentId:f.cognitiveAssignmentId,required:true}});f.product=p;persist()
  assert.equal(await prisma.cognitiveSession.count({where:{userId:id}}),0,'Fresh E student must have no previous Cognitive history')
  const baseline=await reportBaseline();h.write('c25-missing-probe-baseline-private.json',baseline)
  // Resource preparation precedes this single real PostgreSQL clock anchor.
  const t0=await pgNow(),releaseAt=new Date(Date.parse(t0)+300000).toISOString();f.schedule={t0,releaseAt};h.result.schedule=f.schedule;persist()
  p=await teacher.request(`${products}/${p.id}`,'PUT',{revision:p.revision,name:p.name,courseIds:[f.courseId],publicEnabled:false,expiresAt:p.expiresAt,trainingPersistencePolicy:policy(true),trainingFeedbackPolicy:{schemaVersion:1,mode:'SCHEDULED',releaseAt}})
  p=await publish(teacher,p);f.product=p;persist()
  const x=await startAuthenticated(student,p),parent=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:x.attempt.id}}),slots=await loadFrozenActiveSlotSet(parent.frozenActiveSlotSetEncrypted,prisma),unit=x.attempt.currentItem
  assert.equal(unit.type,'COGNITIVE');assert.equal(slots.slots.length,1);assert.equal(slots.slots[0].unitType,'COGNITIVE')
  const session=unit.cognitiveSession;assert.equal(session.config.totalTrials,120)
  f.case={name:'E',mode:'SCHEDULED',participant:'AUTHENTICATED',compositeId:parent.compositeAssessmentId,attemptId:parent.id,attemptEpoch:parent.attemptEpoch,courseId:parent.deliveryCourseId,accessTokenId:parent.accessTokenId,roundId:parent.trainingFeedbackSnapshot.roundId,contextSnapshotHash:parent.contextSnapshotHash,slots:slots.slots,children:{cognitiveSessionId:session.sessionId},steps:[]}
  f.restoreCases=[{name:'E',mode:'SCHEDULED',participant:'AUTHENTICATED',compositeId:parent.compositeAssessmentId,attemptId:parent.id,courseId:parent.deliveryCourseId,accessTokenId:null,roundId:null}]
  verifyProbeSource(f,old);assert.deepEqual(x.attempt.trainingPersistence,persistenceMetadata(parent));assert.deepEqual(x.attempt.trainingPersistence.checkpoint,policy(true).checkpoint);assert.deepEqual(x.attempt.trainingPersistence.localCognitive,policy(true).localCognitive);persist()
  // One legal empty checkpoint envelope permits unchanged terminal assertions.
  const envelope=await checkpointEnvelope(x);assert.deepEqual(envelope.drafts,[]);assert.deepEqual(envelope.cognitiveResults,[])
  const saved=await student.request(`${prefix}/attempts/${parent.id}/checkpoint`,'PUT',{expectedRevision:0,attemptEpoch:parent.attemptEpoch,envelope});assert.equal(saved.revision,1);assert.equal(saved.successfulSaveCount,1)
  f.checkpointCases=[{name:'E',attemptId:parent.id,state:'PAYLOAD'}];persist()
  const native=await student.request(`/cognitive/sessions/${session.sessionId}`);assert.deepEqual(native.trainingPersistence,persistenceMetadata(parent))
  const body=cognitiveFinal(session);assertProbeFinal(body,session)
  const route=`/cognitive/sessions/${session.sessionId}/submit`,response=await student.request(route,'POST',body);assertWithheld(response)
  const accepted=await acceptedFacts(parent.id);assert.equal(accepted.snapshots.length,1);assert.equal(accepted.snapshots[0].unitType,'COGNITIVE')
  f.case.steps=[{type:'COGNITIVE',submissionId:body.submissionId,route,body,snapshotId:accepted.snapshots[0].id}];persist()
  const before=await terminalFacts([parent.id]);h.write('c25-missing-probe-before-drain-private.json',before)
  await drainReports(h,[parent.id])
  const after=await terminalFacts([parent.id]);h.write('c25-missing-probe-after-drain-private.json',after)
  assertTerminalBatch({baseline,before,after,expectedTypes:['COGNITIVE']});assert.equal(h.result.originalOutboxProcessed.length,1)
  const checkpoint=after.cases[0].checkpoint;assert.equal(checkpoint.payloadEncrypted,null);assert.equal(checkpoint.successfulSaveCount,1);f.checkpointCases[0].state='TOMBSTONE'
  f.schedule.submittedAt=await pgNow();assertProbeWindow(f.schedule);persist()
  h.check('One new E student/publication accepted one 120-trial Cognitive FINAL and one original isolated report claim; prior jobs and budget preserved')
  f.schedule.closedStartedAt=await pgNow();persist();const requestStart=h.result.requests.length
  await probeHttpMatrix(h,f,student,true)
  h.result.consumerEvidence={closed:await runConsumerChild(h,'c25-missing-consumers.mjs','closed','c25-missing-consumer')}
  f.schedule.closedFinishedAt=await pgNow();assertProbeWindow(f.schedule,h.result.requests.slice(requestStart));persist()
  h.check('E closed HTTP and actual compiled consumer both completed within the immutable closed window')
  while(true){
   const beforeRead=await pgNow();assert.ok(Date.parse(beforeRead)<=Date.parse(releaseAt)+30000,'Natural opening observation deadline missed')
   if(Date.parse(beforeRead)<Date.parse(releaseAt)){await pause(Math.max(20,Math.min(2000,Date.parse(releaseAt)-Date.parse(beforeRead))));continue}
   const status=await student.request(`${prefix}/attempts/${parent.id}/report-status`);assert.equal(status.reportStatus.state,'READY')
   const now=await pgNow();assert.ok(Date.parse(now)<=Date.parse(releaseAt)+30000,'Natural opening response deadline missed')
   if(status.participantFeedback.state==='AVAILABLE'){assert.ok(Date.parse(beforeRead)>=Date.parse(releaseAt),'AVAILABLE must be observed by an entirely post-release read');f.schedule.observedOpenAt=now;break}
   assert.equal(status.participantFeedback.state,'GENERATED_NOT_RELEASED')
   await pause(Math.max(20,Math.min(2000,Date.parse(releaseAt)-Date.parse(now))))
  }
  assertProbeWindow(f.schedule);persist();await probeHttpMatrix(h,f,student,false)
  h.result.consumerEvidence.open=await runConsumerChild(h,'c25-missing-consumers.mjs','open','c25-missing-consumer')
  assert.deepEqual(await terminalFacts([parent.id]),after,'E opening/reads changed accepted terminal rows')
  const oldAfter=await oldReadSnapshot(old);h.write('c25-missing-probe-old-after-private.json',oldAfter);assert.deepEqual(oldAfter,oldBefore,'E probe changed an inherited A/B/C/D actor, product, parent or fact')
  assert.deepEqual(fs.readFileSync(path.join(h.state,'c25-fixture-private.json')),originalBytes)
  const finalParent=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:p.id}});assert.equal(finalParent.trainingFeedbackPolicy.releaseAt,releaseAt)
  h.result.fixtureIdentity=immutableProbeIdentity(f);h.result.fixtureSha256=sha(fs.readFileSync(path.join(h.state,'c25-missing-probe-fixture-private.json')));h.result.schedule=f.schedule;h.result.inheritedRowsUnchanged=true;h.result.passed=true
  h.check('Natural E opening and paired actual consumer evidence completed with identical immutable identity, results and untouched inherited rows')
 }catch(e){error=e;h.result.windowDiagnostic={failed:true,schedule:f?.schedule??null,observedAt:await pgNow().catch(()=>null),releaseAtNeverAdjusted:true}}finally{await h.finish(error)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(error=>{
 try{if(process.argv[2]&&path.resolve(process.argv[2])===missingState)fs.writeFileSync(path.join(missingState,'c25-missing-probe-entry-error-private.log'),String(error.stack??error),{flag:'wx',mode:0o600})}catch{}
 console.error(JSON.stringify(publicFailure(error)));process.exitCode=1
})
