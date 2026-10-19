/** C06 uses public authoring APIs; direct DB reads inspect accepted synthetic facts only. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../backend')
const require=createRequire(path.join(backend,'package.json'))
const {prisma}=require(path.join(backend,'dist/config/database.js'))
const {decryptUnifiedRuntimePayload}=require(path.join(backend,'dist/modules/assessment-runtime/security.js'))
const {readFormSectionCollectionFacts}=require(path.join(backend,'dist/modules/assessment-runtime/form-facts.js'))
const {loadCompositeTypedFormValues}=require(path.join(backend,'dist/modules/assessment-runtime/typed-form-facts.js'))
const state=process.argv[2], status=JSON.parse(fs.readFileSync(path.join(state,'status.json')))
const fixture=JSON.parse(fs.readFileSync(path.join(state,'fixture-private.json')))
assert.equal(new URL(status.apiUrl).hostname,'127.0.0.1')
const checks=JSON.parse(process.env.C06_COMPLETED_CHECKS||'[]');let requests=0
const observations=[]
const check=name=>{checks.push(name);console.log('PASS',name)}
function client(){const cookies=new Map();return {recovery:null,async request(route,method='GET',body,expected=200){
  requests++;const start=performance.now();const wire=body===undefined?undefined:JSON.stringify(body)
  const response=await fetch(status.apiUrl+'/api'+route,{method,signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json',...(cookies.size?{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(cookies.has('ptool_csrf')?{'x-csrf-token':cookies.get('ptool_csrf')}:{}) ,...(this.recovery?{'x-recovery-token':this.recovery}:{})},...(wire===undefined?{}:{body:wire})})
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
  const text=await response.text();observations.push({method,status:response.status,requestBytes:wire?Buffer.byteLength(wire):0,responseBytes:Buffer.byteLength(text),durationMs:Math.round(performance.now()-start)})
  assert.equal(response.status,expected,`${method} ${route}: ${text.slice(0,500)}`)
  const data=JSON.parse(text);if(expected!==200)return data
  assert.equal(data.code,0,`${route}: ${data.message}`);return data.data
}}}
const teacher=client(),student=client()
async function projection(f,expected,historyId){
 for(const route of ['/questionnaire-products/available','/composite-assessments/available']){
  const data=await student.request(route);const row=(Array.isArray(data)?data:data.list).find(x=>x.id===f.compositeAssessmentId);assert.ok(row);assert.equal(row.hasSatisfiedAttempt,expected);assert.equal(row.latestCompletedAttempt.id,f.id);assert.equal(row.latestCompletedAttempt.taskSatisfied,false);assert.equal(row.canStartNewAttempt,false);assert.equal(row.maxAttempts,1);if(historyId)assert.equal(row.latestSatisfiedAttempt.id,historyId)
 }
 const tasks=await student.request(`/courses/my/tasks?courseId=${f.deliveryCourseId}&pageSize=100`);const task=tasks.list.find(x=>x.id===f.compositeAssessmentId);assert.ok(task);assert.equal(task.state,expected?'COMPLETED':'SUBMITTED_NOT_SATISFIED');assert.equal(task.canStart,false);assert.equal(task.canContinue,false);assert.ok(task.href.endsWith('/'+f.id+'/report'))
 const inbox=await student.request('/my-assessments');const entry=inbox.list.find(x=>x.sourceId===f.compositeAssessmentId);assert.ok(entry);assert.equal(entry.state,task.state);assert.equal(entry.launchTarget,null);assert.equal(entry.reportTarget,task.href)
 const report=await student.request(`/composite-assessments/attempts/${f.id}/report`);assert.equal(report.taskSatisfied,false)
 await student.request(`/composite-assessments/${f.compositeAssessmentId}/attempts`,'POST',{},409)
 const details=await teacher.request(`/questionnaire-products/${f.compositeAssessmentId}`);assert.equal(details.attemptCounts.completed,expected?2:1);assert.equal(details.attemptCounts.satisfied,expected?1:0);assert.equal(details.attemptCounts.notSatisfied,1)
 const overview=await teacher.request(`/questionnaire-products/workspace/courses/${f.deliveryCourseId}?pageSize=50`);const row=overview.list.find(x=>x.id===f.compositeAssessmentId);assert.ok(row);assert.equal(row.attempts.COMPLETED,expected?2:1);assert.equal(row.attempts.SATISFIED,expected?1:0);assert.equal(row.attempts.NOT_SATISFIED,1)
 const participants=await teacher.request(`/composite-assessments/${f.compositeAssessmentId}/attempts`);const latest=participants.list.find(x=>x.id===f.id);assert.ok(latest);assert.equal(latest.taskSatisfied,false)
}
try{
 for(const [c,credentials,role] of [[teacher,fixture.teacher,'TEACHER'],[student,fixture.student,'STUDENT']]){await c.request('/auth/csrf');await c.request('/auth/training-login','POST',{...credentials,expectedRole:role})}
 const user=await prisma.user.findUniqueOrThrow({where:{username:fixture.student.username}})
 const attempts=await prisma.compositeAssessmentAttempt.findMany({where:{userId:user.id,status:'COMPLETED',taskSatisfaction:'NOT_SATISFIED',compositeAssessment:{name:'C06 policy synthetic'}},orderBy:{startedAt:'desc'},include:{compositeAssessment:true}})
 const selected=[];for(const f of attempts){if(!selected.some(x=>x.compositeAssessmentId===f.compositeAssessmentId))selected.push(f);if(selected.length===2)break}assert.equal(selected.length,2)
 for(const [index,f] of selected.entries()){
  await projection(f,false)
  check('actual task/inbox/two available feeds/report/maxAttempts/teacher counts before history '+index)
  // Explicit isolated legacy-history fixture only. No public API is added and
  // no policy, accepted FINAL, snapshot or attempt permission is overwritten.
  const date=new Date(f.startedAt.getTime()-86400000)
  const historical=await prisma.compositeAssessmentAttempt.create({data:{compositeAssessmentId:f.compositeAssessmentId,userId:f.userId,participantKey:f.participantKey,attemptNo:99+index,status:'COMPLETED',taskSatisfaction:index===0?null:'SATISFIED',deliveryCourseId:f.deliveryCourseId,startedAt:date,lastSavedAt:date,completedAt:date,progress:100}})
  await projection(f,true,historical.id)
  check('synthetic historical '+(index===0?'NULL':'SATISFIED')+' remains achieved despite later real NOT_SATISFIED; report targets latest submission and counts use attempts')
 }
 fs.writeFileSync(path.join(state,'c06-http-result.json'),JSON.stringify({passed:true,requests,checks,observations,historyFixture:'Two isolated DB rows, one historical NULL and one SATISFIED; older timestamps; existing actual NOT_SATISFIED FINAL rows untouched. No snapshots/report assertions for synthetic history.'},null,2))
}catch(error){fs.writeFileSync(path.join(state,'c06-http-result.json'),JSON.stringify({passed:false,requests,checks,observations,error:String(error)},null,2));throw error}finally{await prisma.$disconnect()}
process.exit(0)
