/** One natural scheduled boundary. All resources exist before T0; never move the
 * release time, update terminal state, fake a clock, or replay accepted old work. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFile} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {harness,runtime,products,prefix,pub,policy,receiptRoute,pgNow,reportBaseline,terminalFacts,assertTerminalBatch,acceptedFacts,assertWithheld,assertWindow,persistenceMetadata,sha} from './c25-client.mjs'
import {actors,publish,startAuthenticated,startAnonymous,retain,saveCheckpoint,markTombstones,persist,attemptRoute,checkpointRoute,scaleAnswers} from './c25-fixture.mjs'
const h=await harness('scheduled',600);let error
const directory=path.dirname(fileURLToPath(import.meta.url))
async function consumer(mode){
 const log=fs.openSync(path.join(h.state,`c25-consumer-${mode}-process-private.log`),'wx',0o600)
 try{await new Promise((resolve,reject)=>{const child=execFile(process.execPath,['--require',path.join(directory,'loopback-only.cjs'),path.join(directory,'c25-consumers.mjs'),h.state,'--mode',mode],{env:process.env,timeout:Math.ceil(Math.min(30000,h.remaining())),maxBuffer:4*1024*1024},(failure,stdout,stderr)=>{fs.writeSync(log,stdout);fs.writeSync(log,stderr);if(failure)reject(new Error('C25 consumer '+mode+' failed; inspect private log'));else resolve()});child.on('error',reject)})}finally{fs.closeSync(log)}
 assert.equal(h.read(`c25-consumer-${mode}-result.json`).passed,true,'C25 consumer evidence missing')
 h.result.consumerEvidence??={};h.result.consumerEvidence[mode]={path:`c25-consumer-${mode}-result.json`,sha256:sha(fs.readFileSync(path.join(h.state,`c25-consumer-${mode}-result.json`)))}
}
async function finishFour(f,name,x){
 const {prisma,cognitiveFinal}=await runtime(),{formBody}=await import('./c20-materials-fixture.mjs'),entry=f.cases[name]
 for(const type of ['FORM_SECTION','SCALE','COGNITIVE','SITUATIONAL']){
  const unit=x.attempt.currentItem;assert.equal(unit.type,type)
  let route,body
  if(type==='FORM_SECTION'){route=attemptRoute(x)+`/form-sections/${unit.id}/submit`;body=formBody(x.attempt,'yes')}
  else if(type==='SCALE'){entry.children.scaleId=unit.scaleAssessmentId;route=attemptRoute(x)+`/items/${unit.id}/scale/submit`;body={submissionId:randomUUID(),attemptEpoch:x.attempt.attemptEpoch,definitionHash:unit.definitionHash,contextSnapshotHash:x.attempt.contextSnapshotHash,answers:scaleAnswers(unit.scale.definition)}}
  else if(type==='COGNITIVE'){
   const session=unit.cognitiveSession;entry.children.cognitiveSessionId=session.sessionId;assert.equal(session.config.totalTrials,120)
   route=(x.base===pub?'/public':'')+`/cognitive/sessions/${session.sessionId}/submit`;body=cognitiveFinal(session,x.client.recovery)
   const native=await x.client.request(route.replace(/\/submit$/,'')),parent=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:x.attempt.id}})
   assert.deepEqual(native.trainingPersistence,persistenceMetadata(parent));assert.deepEqual(native.trainingPersistence.checkpoint,policy(true).checkpoint);assert.deepEqual(native.trainingPersistence.localCognitive,policy(true).localCognitive)
  }else{
   entry.children.situationalAttemptId=unit.situationalAttemptId;entry.children.situationalItemId=unit.id
   route=attemptRoute(x)+`/items/${unit.id}/situational/${unit.situationalAttemptId}`
   const loaded=await x.client.request(route);assert.equal(loaded.instrument.online.responseProtocol,'sjt-online-response-v1')
   body={submissionId:randomUUID(),attemptEpoch:loaded.attempt.attemptEpoch,definitionHash:loaded.attempt.definitionHash,compiledRuntimeHash:loaded.attempt.compiledRuntimeHash,scoringVersion:loaded.attempt.scoringVersion,responseProtocol:'sjt-online-response-v1',responses:f.sjtResponses};route+='/submit'
  }
  const response=await x.client.request(route,'POST',body);assertWithheld(response)
  const accepted=await acceptedFacts(x.attempt.id);assert.equal(accepted.snapshots.length,entry.steps.length+1)
  const replay=await x.client.request(route,'POST',body);assert.equal(replay.replayed,true);assertWithheld(replay)
  assert.deepEqual(await acceptedFacts(x.attempt.id),accepted,'exact child replay changed fact/job/count')
  entry.steps.push({type,submissionId:body.submissionId,route,body:structuredClone(body),snapshotId:accepted.snapshots.find(s=>s.unitType===type).id});persist(h,f)
  const checkpoint=await x.client.request(checkpointRoute(x)),finished=new Set(accepted.snapshots.map(s=>s.slotKey)),original=entry.checkpointDraftSlots
  assert.deepEqual(checkpoint.envelope.drafts.map(d=>d.slotKey).sort(),original.filter(key=>!finished.has(key)).sort(),'child FINAL must retain every other unfinished draft')
  assert.deepEqual(checkpoint.discardedTerminalSlotKeys.sort(),original.filter(key=>finished.has(key)).sort())
  x.attempt=await x.client.request(attemptRoute(x));assertWithheld(x.attempt)
 }
 assert.equal(x.attempt.status,'IN_PROGRESS');assert.equal(x.attempt.allUnitsSubmitted,true)
}
const sjtRoute=(x,c)=>attemptRoute(x)+`/items/${c.children.situationalItemId}/situational/${c.children.situationalAttemptId}`
async function participantMatrix(f,name,x,closed){
 const {prisma}=await runtime(),c=f.cases[name],base=attemptRoute(x),parent=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:c.attemptId}})
 const state=await x.client.request(base);assert.equal(state.status,'COMPLETED');assertWithheld(state)
 const status=await x.client.request(base+'/report-status');assert.equal(status.status,'COMPLETED');assert.equal(status.reportStatus.state,'READY');assert.equal(status.participantFeedback.releaseAt,f.schedule.releaseAt);assert.equal(status.participantFeedback.state,closed?'GENERATED_NOT_RELEASED':'AVAILABLE');assertWithheld(status)
 // Reuse the exact newly accepted private FINAL bodies after parent completion.
 // These are idempotent confirmations, not new submissions or reconstructed data.
 assert.deepEqual(c.steps.map(step=>step.type),['FORM_SECTION','SCALE','COGNITIVE','SITUATIONAL'])
 const replayBaseline={terminal:await terminalFacts([c.attemptId]),facts:await acceptedFacts(c.attemptId)}
 for(const step of c.steps){
  assert.equal(step.body.submissionId,step.submissionId)
  const replay=await x.client.request(step.route,'POST',step.body);assert.equal(replay.replayed,true)
  if(closed)assertWithheld(replay)
  assert.deepEqual({terminal:await terminalFacts([c.attemptId]),facts:await acceptedFacts(c.attemptId)},replayBaseline,'post-terminal exact replay changed accepted facts/jobs/checkpoint')
 }
 h.result.measurements.push({case:name,stage:closed?'CLOSED_TERMINAL_FINAL_REPLAY':'OPEN_TERMINAL_FINAL_REPLAY',types:c.steps.map(step=>step.type),exactOriginalBodies:true,acceptedFactsJobsCheckpointUnchanged:true})
 const report=await x.client.request(base+'/report','GET',undefined,closed?403:200)
 if(closed)assertWithheld(report);else {assert.deepEqual(report.unitReports.map(u=>u.type).sort(),['COGNITIVE','SCALE','SITUATIONAL']);assert.equal(report.backgroundValues.length,1)}
 if(x.base===prefix){const partial=await x.client.request(base+'/report?partial=1','GET',undefined,closed?403:200);if(closed)assertWithheld(partial);else assert.equal(partial.unitReports.length,3)}
 const unreceived=c.unreceivedWholeSubmissionId??=randomUUID(),receipt=await x.client.request(receiptRoute(x.base,c.attemptId,unreceived,c.attemptEpoch));assert.equal(receipt.status,'NOT_RECEIVED');assert.equal(receipt.submissionId,unreceived);assertWithheld(receipt)
 const analysis=await x.client.request(base+'/analysis-export?format=json','GET',undefined,closed?403:400);assert.ok(closed?/反馈|feedback|尚未/i.test(analysis.message):/collection-only|不支持综合分析导出/.test(analysis.message),'analysis-export must fail for the intended reason')
 if(x.base===prefix){const scale=await x.client.request(`/scales/assessments/${c.children.scaleId}`,'GET',undefined,closed?403:200);if(closed)assertWithheld(scale);else {assert.ok(['scores','full'].includes(scale.report?.kind),'opened Scale numeric report absent');assert.ok(scale.report.scores?.length>0)}}
 const cognitive=await x.client.request((x.base===pub?'/public':'')+`/cognitive/sessions/${c.children.cognitiveSessionId}`)
 assert.deepEqual(cognitive.trainingPersistence,persistenceMetadata(parent))
 if(closed){assert.equal(cognitive.feedbackDeferred,true);assertWithheld(cognitive)}else{assert.notEqual(cognitive.feedbackDeferred,true);assert.ok(cognitive.result||cognitive.score!=null,'opened Cognitive result absent')}
 const embedded=await x.client.request(sjtRoute(x,c));if(closed){assert.equal(embedded.feedbackDeferred,true);assertWithheld(embedded)}else assert.ok(embedded.result&&embedded.canonicalResult)
 if(x.base===prefix){
  for(const [suffix,method] of [['','GET'],['/resume','POST'],['/result','GET']]){const sjt=await x.client.request(`/situational/attempts/${c.children.situationalAttemptId}${suffix}`,method,method==='POST'?{}:undefined);if(closed){assert.equal(sjt.feedbackDeferred,true);assertWithheld(sjt)}else assert.ok(sjt.result&&sjt.canonicalResult)}
  const cognitiveHistory=await x.client.request('/cognitive/history'),history=cognitiveHistory.list.find(row=>row.sessionId===c.children.cognitiveSessionId);assert.ok(history,'embedded Cognitive history record required')
  if(closed){assert.equal(history.score,null);assert.equal(history.qualityState,null);assert.equal(history.feedbackDeferred,true);assertWithheld(history)}else{assert.notEqual(history.feedbackDeferred,true);assert.ok(history.score!==null||history.qualityState!==null)}
  const scales=await x.client.request('/scales/assessments/my');assert.ok(!scales.list.some(row=>row.id===c.children.scaleId))
  const sjts=await x.client.request('/situational/history');assert.ok(!sjts.list.some(row=>row.attemptId===c.children.situationalAttemptId))
  await x.client.request(`/situational/attempts/${c.children.situationalAttemptId}/research-export`,'GET',undefined,[403,404])
 }
 await x.client.request(checkpointRoute(x),'GET',undefined,409)
 persist(h,f)
}
async function teacherMatrix(f,a,anonymous){
 const {prisma,require,backend,parseCsv}=await runtime(),p=f.products.scheduled
 const targets=['B','C'].map(name=>f.cases[name])
 for(const c of targets){
  const base=`${prefix}/${p.id}/attempts/${c.attemptId}`,status=await a.teacher.request(base+'/report-status');assert.equal(status.reportStatus.state,'READY')
  const report=await a.teacher.request(base+'/report');assert.equal(report.unitReports.length,3);assert.equal(report.backgroundValues.length,1)
  for(const denied of [a.otherTeacher,a.student,anonymous])for(const suffix of ['/report-status','/report'])await denied.request(base+suffix,'GET',undefined,[401,403,404])
 }
 const exportBase=`${prefix}/${p.id}/export`,preview=await a.teacher.request(exportBase+'/preview?detail=full');assert.ok(preview.recordCount>=2)
 for(const denied of [a.otherTeacher,a.student,anonymous]){await denied.request(exportBase+'/preview?detail=full','GET',undefined,[401,403,404]);await denied.request(exportBase,'POST',{detail:'full',format:'csv'},[401,403,404])}
 const queued=await a.teacher.request(exportBase,'POST',{detail:'full',format:'csv'});assert.ok(queued.batchId);assert.equal(queued.artifacts.length,1)
 f.export={batchId:queued.batchId,url:queued.artifacts[0].downloadUrl.replace(/^\/api/,'')};persist(h,f)
 const {exportQueue}=require(path.join(backend,'dist/config/queue.js')),{runExportBatch}=require(path.join(backend,'dist/workers/exportBatchTask.js'))
 const job=await exportQueue.getJob('export-'+queued.batchId);assert.ok(job);assert.equal(job.data.batchId,queued.batchId)
 await runExportBatch({data:job.data,id:job.id,opts:{attempts:1},attemptsMade:0})
 const batch=await prisma.exportBatch.findUniqueOrThrow({where:{id:queued.batchId}});assert.equal(batch.status,'READY')
 assert.equal((await a.teacher.request(f.export.url+'/status')).status,'READY')
 const bytes=await a.teacher.request(f.export.url,'GET',undefined,200,true),csv=parseCsv(bytes)
 for(const c of targets)assert.ok(csv.rows.some(row=>row.A_attempt_id===c.attemptId),'real teacher CSV is missing completed fixture')
 for(const denied of [a.otherTeacher,a.student,anonymous]){await denied.request(f.export.url,'GET',undefined,[401,403,404]);await denied.request(f.export.url+'/status','GET',undefined,[401,403,404])}
 h.result.teacherExport={batchId:queued.batchId,bytes:bytes.length,sha256:sha(bytes),rows:csv.rows.length,originalJob:true}
}
async function crossOwner(f,a,b,c,d){
 const {prisma}=await runtime()
 assert.equal((await d.client.request(attemptRoute(d))).id,f.cases.D.attemptId)
 assert.notEqual(d.client.recovery,c.client.recovery)
 for(const [target,client,entry] of [[c,d.client,f.cases.C],[b,a.outsider,f.cases.B]]){
  const before={parent:await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:entry.attemptId}}),checkpoint:await prisma.trainingAttemptCheckpoint.findUniqueOrThrow({where:{attemptId:entry.attemptId}}),facts:await acceptedFacts(entry.attemptId)}
  const routes=[attemptRoute(target),attemptRoute(target)+'/report',attemptRoute(target)+'/report-status',checkpointRoute(target),(target.base===pub?'/public':'')+`/cognitive/sessions/${entry.children.cognitiveSessionId}`,sjtRoute(target,entry)]
  if(target.base===prefix)routes.push(`/scales/assessments/${entry.children.scaleId}`,`/situational/attempts/${entry.children.situationalAttemptId}/result`)
  for(const route of routes){await client.request(route,'GET',undefined,[403,404]);assert.deepEqual({parent:await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:entry.attemptId}}),checkpoint:await prisma.trainingAttemptCheckpoint.findUniqueOrThrow({where:{attemptId:entry.attemptId}}),facts:await acceptedFacts(entry.attemptId)},before,'wrong owner changed target rows')}
 }
 const row=await prisma.trainingAttemptCheckpoint.findUniqueOrThrow({where:{attemptId:f.cases.D.attemptId}});assert.ok(row.payloadEncrypted);assert.equal(row.successfulSaveCount,1)
}
try{
 assert.equal(h.read('c25-prepare-result.json').passed,true)
 const {prisma,drainReports,pause}=await runtime(),f=h.read('c25-fixture-private.json'),a=await actors(h,f),draft=f.products.scheduled
 assert.equal((await prisma.compositeAssessment.findUniqueOrThrow({where:{id:draft.id}})).status,'DRAFT')
 const baseline=await reportBaseline();h.write('c25-scheduled-baseline-private.json',baseline)
 // This is the sole scheduling clock anchor, immediately before the legal draft edit.
 const t0=await pgNow(),releaseAt=new Date(Date.parse(t0)+300000).toISOString();f.schedule={t0,releaseAt};h.result.schedule=f.schedule;persist(h,f)
 let p=await a.teacher.request(`${products}/${draft.id}`,'PUT',{revision:draft.revision,name:draft.name,courseIds:[f.courseId],publicEnabled:true,expiresAt:draft.expiresAt,trainingPersistencePolicy:policy(true),trainingFeedbackPolicy:{schemaVersion:1,mode:'SCHEDULED',releaseAt}})
 p=await publish(a.teacher,p);f.products.scheduled=p;persist(h,f)
 const b=await startAuthenticated(a.student,p);await retain(h,f,'B',b,'SCHEDULED')
 const c=await startAnonymous(h,a.teacher,p,{round:true});await retain(h,f,'C',c,'SCHEDULED');assert.ok(f.cases.C.roundId)
 const d=await startAnonymous(h,a.teacher,p);await retain(h,f,'D',d,'SCHEDULED');assert.equal(f.cases.D.roundId,null)
 for(const [name,x] of [['B',b],['C',c],['D',d]]){const envelope=await saveCheckpoint(h,f,name,x);f.cases[name].checkpointDraftSlots=envelope.drafts.map(row=>row.slotKey);persist(h,f)}
 await finishFour(f,'B',b);await finishFour(f,'C',c)
 const before=await terminalFacts([b.attempt.id,c.attempt.id]);h.write('c25-scheduled-before-drain-private.json',before)
 // Exactly one shared unchanged 120-second C20 gate, both genuine jobs.
 await drainReports(h,[b.attempt.id,c.attempt.id])
 const after=await terminalFacts([b.attempt.id,c.attempt.id]);h.write('c25-scheduled-after-drain-private.json',after)
 assertTerminalBatch({baseline,before,after,expectedTypes:['FORM_SECTION','SCALE','COGNITIVE','SITUATIONAL']});await markTombstones(h,f,['B','C'])
 f.schedule.submittedAt=await pgNow();assertWindow(f.schedule);persist(h,f)
 h.check('B/C each accepted four typed child FINALs and exact replays; D saved without FINAL; one shared original drain preserves facts/jobs and returns budget baseline')
 f.schedule.closedStartedAt=await pgNow();const requestStart=h.result.requests.length
 await participantMatrix(f,'B',b,true);await participantMatrix(f,'C',c,true)
 const anonymous=h.client();await anonymous.request('/auth/csrf');await teacherMatrix(f,a,anonymous);await crossOwner(f,a,b,c,d)
 await consumer('closed')
 f.schedule.closedFinishedAt=await pgNow();assertWindow({...f.schedule,requests:h.result.requests.slice(requestStart)});persist(h,f)
 h.check('Closed COMPLETED/READY participant composite/native/history/receipt/analysis outlets withhold results; authorized teacher actual CSV and strict ownership remain intact')
 // Each pause is bounded polling backoff only. Success requires a fresh PG clock
 // plus actual HTTP AVAILABLE; elapsed client sleep alone never establishes it.
 let observed
 while(true){
  const beforeRead=await pgNow();assert.ok(Date.parse(beforeRead)<=Date.parse(releaseAt)+30000,'natural release observation deadline missed')
  const status=await b.client.request(attemptRoute(b)+'/report-status');assert.equal(status.reportStatus.state,'READY')
  const now=await pgNow();assert.ok(Date.parse(now)<=Date.parse(releaseAt)+30000,'natural release response deadline missed')
  if(status.participantFeedback.state==='AVAILABLE'){assert.ok(Date.parse(now)>=Date.parse(releaseAt));observed=now;break}
  assert.equal(status.participantFeedback.state,'GENERATED_NOT_RELEASED')
  await pause(Math.max(20,Math.min(2000,Date.parse(releaseAt)-Date.parse(now))))
 }
 f.schedule.observedOpenAt=observed;assertWindow(f.schedule);persist(h,f)
 await participantMatrix(f,'B',b,false);await participantMatrix(f,'C',c,false);await consumer('open')
 const final=await terminalFacts([b.attempt.id,c.attempt.id]);assert.deepEqual(final,after,'feedback opening/reads changed accepted report/checkpoint facts')
 const dCheckpoint=await prisma.trainingAttemptCheckpoint.findUniqueOrThrow({where:{attemptId:d.attempt.id}});assert.ok(dCheckpoint.payloadEncrypted);assert.equal(dCheckpoint.successfulSaveCount,1)
 assert.equal((await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:d.attempt.id}})).status,'IN_PROGRESS');assert.equal(await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:d.attempt.id}}),0)
 assert.equal((await prisma.compositeAssessment.findUniqueOrThrow({where:{id:p.id}})).trainingFeedbackPolicy.releaseAt,releaseAt)
 h.result.schedule=f.schedule;h.result.passed=true;persist(h,f)
 h.check('Unmodified server-clock release makes owner reports and native results available; no-package analysis stays unsupported; accepted facts and unfinished D remain unchanged')
}catch(e){error=e;h.result.windowDiagnostic={failed:true,schedule:h.result.schedule??null,observedAt:await pgNow().catch(()=>null),releaseAtNeverAdjusted:true}}finally{await h.finish(error)}
