/** Pure C25 contracts only. No runtime imports, service, DB, build or browser. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {policy,receiptRoute,publicFailure,publicRoute,publicPostgresFailure,persistenceMetadata,assertWithheld,assertWindow,assertTerminalBatch} from './c25-client.mjs'
import {scaleAnswers} from './c25-fixture.mjs'
const copy=value=>structuredClone(value)
const t0='2026-10-19T08:00:00.000Z',releaseAt='2026-10-19T08:05:00.000Z'
function terminal(whole=false){
 const types=whole?['SCALE']:['FORM_SECTION','SCALE','COGNITIVE','SITUATIONAL'],n=whole?1:2,ids=whole?['A']:['B','C'],baseline={queue:{id:'reports',pending:7},otherJobs:[{id:'old',attemptId:'old',status:'PENDING',attemptCount:2}]}
 const checkpoint=id=>({attemptId:id,attemptEpoch:1,snapshotHash:'a'.repeat(64),definitionHash:'b'.repeat(64),roundId:id==='C'?'round':null,revision:5,successfulSaveCount:1,payloadEncrypted:'cipher',payloadHash:'c'.repeat(64),expiresAt:'2026-10-19T09:00:00Z',updatedAt:'before'})
 const snapshots=id=>types.map((type,index)=>({id:id+'-'+index,compositeAttemptId:id,attemptEpoch:1,unitType:type,slotKey:type,terminalState:'COMPLETED',payloadEncrypted:'unchanged'}))
 const before={cases:ids.map(id=>({parent:{id,status:'IN_PROGRESS',attemptEpoch:1,asyncReportEpoch:1},job:{id:'job-'+id,attemptId:id,attemptEpoch:1,status:'PENDING',attemptCount:0,budgetHeld:true},checkpoint:checkpoint(id),snapshots:whole?[]:snapshots(id)})),queue:{...baseline.queue,pending:7+n},otherJobs:copy(baseline.otherJobs)}
 const after={cases:ids.map(id=>({parent:{id,status:'COMPLETED',completedAt:'natural',attemptEpoch:1,asyncReportEpoch:1},job:{id:'job-'+id,attemptId:id,attemptEpoch:1,status:'READY',attemptCount:1,budgetHeld:false},checkpoint:{...checkpoint(id),revision:whole?7:6,payloadEncrypted:null,payloadHash:null,expiresAt:null,updatedAt:'after'},snapshots:snapshots(id)})),queue:copy(baseline.queue),otherJobs:copy(baseline.otherJobs)}
 return {baseline,before,after,expectedTypes:types,whole}
}
test('A and four-tool persistence policies have exact one-hour semantics',()=>{
 assert.deepEqual(policy(false),{schemaVersion:1,checkpoint:{enabled:true,ttlHours:1},localCognitive:null})
 assert.deepEqual(policy(true),{schemaVersion:1,checkpoint:{enabled:true,ttlHours:1},localCognitive:{enabled:true,ttlHours:1}})
})
test('whole receipt always carries original submissionId and attemptEpoch',()=>{
 const route=receiptRoute('/public/composite-assessments','attempt','original-submission-123',3)
 const parsed=new URL(route,'http://127.0.0.1');assert.equal(parsed.searchParams.get('submissionId'),'original-submission-123');assert.equal(parsed.searchParams.get('attemptEpoch'),'3')
 assert.equal(parsed.pathname,'/public/composite-assessments/attempts/attempt/whole/receipt')
 assert.equal(publicRoute(route),parsed.pathname)
})
test('public diagnostics never echo payload, token or raw SQL message',()=>{
 const secret='PRIVATE_RECOVERY_AND_PAYLOAD',failure=publicFailure({name:'DatabaseError',message:secret,stack:secret})
 assert.ok(!JSON.stringify(failure).includes(secret));assert.deepEqual(publicPostgresFailure({code:'P0001',message:secret}),{category:'POSTGRES_TRANSACTION_REJECTED',code:'P0001'})
 assert.equal(publicRoute('/public/composite-assessments/'+secret+'/start?recoveryToken='+secret),'/public/composite-assessments/[token]/start')
})
test('closed native receipts permit definition metadata but reject result fields',()=>{
 assertWithheld({status:'COMPLETED',reportStatus:{state:'READY'},feedbackDeferred:true,score:null,qualityState:null,instrument:{report:{title:'Static definition'},definition:{metricKey:'total'}}})
 for(const value of [{score:1},{result:{}},{canonicalResult:{}},{data:{metrics:[]}},{qualityState:'valid'},{report:{body:'accepted result'}},{unitReports:[{}]}])assert.throws(()=>assertWithheld(value))
})
test('native persistence metadata equals the actual frozen parent binding',()=>{
 const row={id:'B',attemptEpoch:1,deliveryCourseId:'course',trainingPersistenceSnapshotHash:'a'.repeat(64),trainingPersistenceSnapshot:{policy:policy(true)}}
 assert.deepEqual(persistenceMetadata(row),{attemptId:'B',attemptEpoch:1,courseId:'course',snapshotHash:'a'.repeat(64),checkpoint:{enabled:true,ttlHours:1},localCognitive:{enabled:true,ttlHours:1}})
})
test('scheduled budgets use fixed five-minute release and real clock observations',()=>{
 const good={t0,releaseAt,submittedAt:'2026-10-19T08:03:00.000Z',closedStartedAt:'2026-10-19T08:03:00.000Z',closedFinishedAt:'2026-10-19T08:03:59.999Z',requests:[{receivedAt:'2026-10-19T08:03:59.000Z',serverDate:'Mon, 19 Oct 2026 08:03:59 GMT'}],observedOpenAt:'2026-10-19T08:05:00.000Z'}
 assertWindow(good)
 for(const patch of [{releaseAt:'2026-10-19T08:06:00Z'},{submittedAt:'2026-10-19T08:03:00.001Z'},{closedFinishedAt:'2026-10-19T08:04:00Z'},{observedOpenAt:'2026-10-19T08:04:59.999Z'},{observedOpenAt:'2026-10-19T08:05:30.001Z'},{requests:[{receivedAt:'2026-10-19T08:04:00Z'}]},{requests:[{receivedAt:'2026-10-19T08:03:59Z',serverNow:'2026-10-19T08:04:00Z'}]}])assert.throws(()=>assertWindow({...good,...patch}))
})
test('shared terminal drain accepts actual four types, one original claim each and preserved budget',()=>{
 const value=terminal();assertTerminalBatch(value)
 for(const mutate of [v=>v.after.cases[0].snapshots[0].unitType='FORM_SECTION_DUPLICATE',v=>v.after.cases[0].snapshots[0].payloadEncrypted='changed',v=>v.after.cases[0].checkpoint.successfulSaveCount=0,v=>v.after.cases[0].checkpoint.payloadEncrypted='retained',v=>v.after.cases[0].checkpoint.revision=5,v=>v.after.cases[0].job.attemptCount=2,v=>v.after.cases[0].job.id='replacement',v=>v.after.queue.pending++,v=>v.after.otherJobs[0].status='READY']){const bad=copy(value);mutate(bad);assert.throws(()=>assertTerminalBatch(bad))}
})
test('whole ACK has no fake snapshot before the actual original processor',()=>{
 const value=terminal(true);assertTerminalBatch(value)
 const forged=copy(value);forged.before.cases[0].snapshots=copy(forged.after.cases[0].snapshots);assert.throws(()=>assertTerminalBatch(forged))
})
test('Scale answers use actual runner options rather than assumed source schema',()=>{
 assert.deepEqual(scaleAnswers({items:[{itemCode:'one',options:[{value:'no'},{value:'yes'}]},{itemCode:'two',options:[{value:4}]}]}),[{itemCode:'one',responseValue:'yes',responseTimeMs:17},{itemCode:'two',responseValue:4,responseTimeMs:17}])
 assert.throws(()=>scaleAnswers({items:[{itemCode:'missing'}]}))
})
test('C25 source has no historical checkpoint GET or global cleanup and shares one B/C drain',()=>{
 const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8')
 for(const name of ['c25-client.mjs','c25-fixture.mjs','c25-prepare.mjs','c25-scheduled.mjs','c25-guards.mjs']){
  const source=read(name);assert.ok(!source.includes('cleanupExpiredTrainingCheckpoints'));assert.ok(!source.includes("h.write('c20-"));assert.ok(!source.includes("h.write('c23-"))
 }
 const source=read('c25-scheduled.mjs');assert.equal((source.match(/await drainReports\(h,/g)??[]).length,1);assert.ok(source.includes('await drainReports(h,[b.attempt.id,c.attempt.id])'));assert.ok(source.includes("await consumer('closed')"));assert.ok(source.includes("await consumer('open')"));assert.ok(!source.includes('detached:'))
})

test('post-terminal replays retain exact private originals and preserve accepted facts/jobs/checkpoint',()=>{
 const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8'),scheduled=read('c25-scheduled.mjs'),prepare=read('c25-prepare.mjs')
 assert.ok(scheduled.includes('route,body:structuredClone(body),snapshotId:'))
 const matrix=scheduled.slice(scheduled.indexOf('async function participantMatrix('),scheduled.indexOf('async function teacherMatrix('))
 assert.ok(matrix.indexOf("assert.equal(status.reportStatus.state,'READY')")<matrix.indexOf('const replayBaseline='))
 assert.ok(matrix.includes("x.client.request(step.route,'POST',step.body)"));assert.ok(matrix.includes('assert.equal(replay.replayed,true)'));assert.ok(matrix.includes('if(closed)assertWithheld(replay)'))
 assert.ok(matrix.includes("},replayBaseline,'post-terminal exact replay changed accepted facts/jobs/checkpoint'"))
 assert.ok(scheduled.includes("await participantMatrix(f,'B',b,true)")&&scheduled.includes("await participantMatrix(f,'C',c,true)"))
 assert.ok(scheduled.includes("await participantMatrix(f,'B',b,false)")&&scheduled.includes("await participantMatrix(f,'C',c,false)"))
 assert.ok(prepare.includes('f.cases.A.wholeSubmissionBody=structuredClone(body)'))
 assert.ok(prepare.indexOf("assert.equal(state.status,'COMPLETED')")<prepare.indexOf('const terminalReplayBaseline='))
 assert.ok(prepare.includes("'/whole/submit','POST',f.cases.A.wholeSubmissionBody"))
 assert.ok(prepare.includes('assert.deepEqual(stableReceipt(replayReceipt),stableReceipt(finalReceipt))'))
 assert.ok(prepare.includes("},terminalReplayBaseline,'completed whole replay changed accepted facts/jobs/checkpoint'"))
})
