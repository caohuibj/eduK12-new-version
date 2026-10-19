/** Prepared missing-only B/C open reads. Import is pure; no accepted FINAL,
 * export, checkpoint GET or A publication read is replayed. */
import assert from 'node:assert/strict'
import {readMissingPrerequisites,missingState} from './c25-missing-contract.mjs'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
import {harness,runtime,prefix,pub,pgNow,acceptedFacts,assertWithheld,persistenceMetadata,sha,publicFailure} from './c25-client.mjs'
import {immutableFixtureIdentity} from './c25-consumers.mjs'
const directory=path.dirname(fileURLToPath(import.meta.url))

export function assertMissingOpenRequest(route,method='GET'){
 assert.equal(typeof route,'string');assert.ok(route.startsWith('/'))
 if(!/^\/(?:public\/)?composite-assessments\/attempts\/[^/]+\/analysis-export\?format=json$/.test(route))assert.doesNotMatch(route,/\/(?:checkpoint|[^/?]*export|submit)(?:[/?]|$)/i,'Accepted FINAL/export/checkpoint must not be replayed')
 if(route.startsWith('/auth/'))assert.ok(['/auth/csrf','/auth/training-login'].includes(route))
 else assert.ok(method==='GET'||(method==='POST'&&/^\/situational\/attempts\/[^/]+\/resume$/.test(route)),'Only the native read-only resume may use POST')
 return true
}
export function limitedReadClient(client){return {get recovery(){return client.recovery},set recovery(value){client.recovery=value},request(route,method='GET',...rest){assertMissingOpenRequest(route,method);return client.request(route,method,...rest)}}}

/** Child inherits the launcher phase group, so the aggregate deadline kills
 * every descendant. Its shorter deadline terminates and reaps the direct
 * observer; failed phase exit also triggers the outer group kill. */
export async function runConsumerChild(h,script,mode,stem='c25-consumer'){
 assert.ok(['c25-consumers.mjs','c25-missing-consumers.mjs'].includes(script));assert.ok(['closed','open'].includes(mode))
 const filename=`${stem}-${mode}-process-private.log`,fd=fs.openSync(path.join(h.state,filename),'wx',0o600)
 const timeout=Math.ceil(Math.min(30000,h.remaining()))
 try{await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--require',path.join(directory,'loopback-only.cjs'),path.join(directory,script),h.state,'--mode',mode],{env:process.env,stdio:['ignore',fd,fd],detached:false})
  let failure=null,killer=null,settled=false
  const signalChild=signal=>{try{child.kill(signal)}catch(error){if(error.code!=='ESRCH')failure??=error}}
  const stop=()=>{failure??=new Error('Consumer child timed out or was interrupted; inspect private process journal');signalChild('SIGTERM');killer??=setTimeout(()=>signalChild('SIGKILL'),2000)}
  const timer=setTimeout(stop,timeout)
  const interrupted=()=>stop();process.once('SIGTERM',interrupted);process.once('SIGINT',interrupted)
  const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);if(killer)clearTimeout(killer);process.removeListener('SIGTERM',interrupted);process.removeListener('SIGINT',interrupted);signalChild('SIGKILL');error?reject(error):resolve()}
  child.once('error',error=>finish(error));child.once('close',(code,signal)=>finish(failure??(code===0?null:new Error(`Consumer ${mode} failed (${code??signal}); inspect private process journal`))))
 })}finally{fs.closeSync(fd)}
 const file=`${stem}-${mode}-result.json`,bytes=fs.readFileSync(path.join(h.state,file)),result=JSON.parse(bytes)
 assert.equal(result.passed,true,'Actual consumer observation is required')
 return {path:file,sha256:sha(bytes)}
}
export async function oldReadSnapshot(f){
 const {prisma}=await runtime(),ids=['A','B','C','D'].map(name=>f.cases[name].attemptId)
 return {parents:await prisma.compositeAssessmentAttempt.findMany({where:{id:{in:ids}},orderBy:{id:'asc'}}),
  checkpoints:await prisma.trainingAttemptCheckpoint.findMany({where:{attemptId:{in:ids}},orderBy:{attemptId:'asc'}}),
  products:await prisma.compositeAssessment.findMany({where:{id:{in:[f.products.A.id,f.products.scheduled.id]}},orderBy:{id:'asc'}}),
  actors:await prisma.user.findMany({where:{id:{in:Object.values(f.actors).map(x=>x.id)}},orderBy:{id:'asc'}}),
  accepted:await Promise.all(ids.map(acceptedFacts)),queue:await prisma.compositeReportQueueBudget.findUniqueOrThrow({where:{id:'reports'}})}
}
export async function missingOpenMatrix(h,f,name,rawClient){
 assert.ok(['B','C'].includes(name));const client=limitedReadClient(rawClient),c=f.cases[name],base=`${c.base}/attempts/${c.attemptId}`
 const {prisma}=await runtime(),parent=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:c.attemptId}})
 const attempt=await client.request(base);assert.equal(attempt.id,c.attemptId);assert.equal(attempt.status,'COMPLETED');assertWithheld(attempt)
 const status=await client.request(base+'/report-status');assert.equal(status.status,'COMPLETED');assert.equal(status.reportStatus.state,'READY');assert.equal(status.participantFeedback.state,'AVAILABLE');assert.equal(status.participantFeedback.releaseAt,f.schedule.releaseAt);assertWithheld(status)
 const report=await client.request(base+'/report');assert.deepEqual(report.unitReports.map(u=>u.type).sort(),['COGNITIVE','SCALE','SITUATIONAL']);assert.equal(report.backgroundValues.length,1)
 if(c.base===prefix){const partial=await client.request(base+'/report?partial=1');assert.equal(partial.unitReports.length,3)}
 const analysis=await client.request(base+'/analysis-export?format=json','GET',undefined,400);assert.match(analysis.message,/collection-only|不支持综合分析导出/,'Opened no-package analysis must fail for the intended reason')
 if(c.base===prefix){const scale=await client.request(`/scales/assessments/${c.children.scaleId}`);assert.ok(['scores','full'].includes(scale.report?.kind));assert.ok(scale.report.scores?.length>0)}
 const cognitive=await client.request((c.base===pub?'/public':'')+`/cognitive/sessions/${c.children.cognitiveSessionId}`);assert.deepEqual(cognitive.trainingPersistence,persistenceMetadata(parent));assert.notEqual(cognitive.feedbackDeferred,true);assert.ok(cognitive.result||cognitive.score!=null)
 const embedded=await client.request(base+`/items/${c.children.situationalItemId}/situational/${c.children.situationalAttemptId}`);assert.ok(embedded.result&&embedded.canonicalResult)
 if(c.base===prefix){
  for(const [suffix,method] of [['','GET'],['/resume','POST'],['/result','GET']]){const value=await client.request(`/situational/attempts/${c.children.situationalAttemptId}${suffix}`,method,method==='POST'?{}:undefined);assert.ok(value.result&&value.canonicalResult)}
  const histories=await client.request('/cognitive/history'),history=histories.list.find(row=>row.sessionId===c.children.cognitiveSessionId);assert.ok(history);assert.notEqual(history.feedbackDeferred,true);assert.ok(history.score!=null||history.qualityState!=null)
  assert.ok(!(await client.request('/scales/assessments/my')).list.some(row=>row.id===c.children.scaleId))
  assert.ok(!(await client.request('/situational/history')).list.some(row=>row.attemptId===c.children.situationalAttemptId))
 }
 h.result.measurements.push({case:name,stage:'MISSING_CURRENT_OPEN_READS',parentCompleted:true,reportReady:true,feedbackAvailable:true,nativeResumeMethod:name==='B'?'POST':null})
}
async function main(){
 readMissingPrerequisites(process.argv[2])
 const h=await harness('missing-open',180);let error
 try{
  const originalBytes=fs.readFileSync(path.join(h.state,'c25-fixture-private.json')),f=JSON.parse(originalBytes),identity=immutableFixtureIdentity(f)
  const before=await oldReadSnapshot(f);h.write('c25-missing-open-before-private.json',before)
  assert.ok(Date.parse(await pgNow())>=Date.parse(f.schedule.releaseAt),'The old release must already have naturally elapsed')
  const student=h.client();await student.login(f.actors.student,'STUDENT')
  await missingOpenMatrix(h,f,'B',student)
  const anonymous=h.client();await anonymous.request('/auth/csrf');anonymous.recovery=f.cases.C.recoveryToken;await missingOpenMatrix(h,f,'C',anonymous)
  h.result.consumerEvidence={open:await runConsumerChild(h,'c25-consumers.mjs','open')}
  const after=await oldReadSnapshot(f);h.write('c25-missing-open-after-private.json',after);assert.deepEqual(after,before,'Missing open reads changed accepted A/B/C/D rows')
  assert.deepEqual(fs.readFileSync(path.join(h.state,'c25-fixture-private.json')),originalBytes,'Original four-case fixture must remain byte-exact')
  assert.deepEqual(immutableFixtureIdentity(f),identity)
  h.result.originalFixtureSha256=sha(originalBytes);h.result.acceptedRowsUnchanged=true;h.result.passed=true
  h.check('Only missing B/C current-open reads and original four-case compiled open evidence completed; accepted rows unchanged')
 }catch(e){error=e}finally{await h.finish(error)}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(error=>{
 try{if(process.argv[2]&&path.resolve(process.argv[2])===missingState)fs.writeFileSync(path.join(missingState,'c25-missing-open-entry-error-private.log'),String(error.stack??error),{flag:'wx',mode:0o600})}catch{}
 console.error(JSON.stringify(publicFailure(error)));process.exitCode=1
})
