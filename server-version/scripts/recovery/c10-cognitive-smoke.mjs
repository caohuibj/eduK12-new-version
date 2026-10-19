/** C10: real ON/OFF/reenabled API processes share only this disposable UTC database. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { randomUUID, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const base=path.dirname(fileURLToPath(import.meta.url)),backend=path.resolve(base,'../../backend'),require=createRequire(path.join(backend,'package.json'))
const {prisma}=require(path.join(backend,'dist/config/database.js'))
const {gonogoSequence}=require(path.join(backend,'dist/modules/cognitive/randomization.js'))
const {createTrialEnvelope}=require(path.join(backend,'dist/modules/cognitive/v2/trial-envelope.js'))
const state=process.argv[2],status=JSON.parse(fs.readFileSync(path.join(state,'status.json'))),fixture=JSON.parse(fs.readFileSync(path.join(state,'fixture-private.json')))
assert.equal(new URL(status.apiUrl).hostname,'127.0.0.1')
const checks=[],counts=[],requests=[];const children=[],logs=[]
const check=name=>{checks.push(name);console.log('PASS',name)}
const pause=ms=>new Promise(r=>setTimeout(r,ms))
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p}
async function api(enabled,label){const p=await port(),log=fs.openSync(path.join(state,label+'.log'),'wx',0o600);logs.push(log)
 const child=spawn(process.execPath,['--require',path.join(base,'loopback-only.cjs'),'dist/index.js'],{cwd:backend,env:{...process.env,COGNITIVE_MODULE_ENABLED:String(enabled),PORT:String(p)},stdio:['ignore',log,log]});children.push(child)
 for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error(label+' exited');try{const r=await fetch(`http://127.0.0.1:${p}/ready`);if(r.ok)return `http://127.0.0.1:${p}`}catch{}await pause(200)}throw Error(label+' startup timeout')}
function client(url){const cookies=new Map();return {url,async request(route,method='GET',body,expected=200){const response=await fetch(this.url+'/api'+route,{method,signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json',...(cookies.size?{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(cookies.has('ptool_csrf')?{'x-csrf-token':cookies.get('ptool_csrf')}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});for(const c of response.headers.getSetCookie()){const pair=c.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}const text=await response.text();requests.push({route,method,status:response.status});assert.equal(response.status,expected,`${method} ${route}: ${text.slice(0,600)}`);const data=JSON.parse(text);if(expected!==200)return data;assert.equal(data.code,0,`${route}: ${data.message}`);return data.data},async login(who,role){await this.request('/auth/csrf');await this.request('/auth/training-login','POST',{...who,expectedRole:role})}}}
function final(session){return {submissionId:randomUUID(),attemptEpoch:session.attemptEpoch,definitionHash:session.definitionHash,contextSnapshotHash:session.contextSnapshotHash,trials:gonogoSequence(session.randomSeed,session.config.totalTrials,session.config.nogoRatio).map((trialType,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*1500,endedAtPerfMs:trialIndex*1500+800,payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?300:null,interrupted:false}}))}}
async function census(){return {parents:await prisma.compositeAssessmentAttempt.count(),sessions:await prisma.cognitiveSession.count(),jobs:await prisma.compositeReportJob.count(),cognitiveTokens:await prisma.cognitiveAccessToken.findMany({orderBy:{id:'asc'},select:{id:true,usedCount:true}}),compositeTokens:await prisma.compositeAssessmentAccessToken.findMany({orderBy:{id:'asc'},select:{id:true,usedCount:true}}),courseQuotaUsed:await prisma.cognitiveSession.count({where:{userId:fixture.student.username}})}}
async function noWrites(name,fn){const before=await census();await fn();const after=await census();assert.deepEqual(after,before,name);counts.push({name,before,after});check(name)}
const teacher=client(status.apiUrl),student=client(status.apiUrl),anon=client(status.apiUrl)
let passed=false
try{
 await teacher.login(fixture.teacher,'TEACHER');await student.login(fixture.student,'STUDENT');await anon.request('/auth/csrf')
 const assignment=await prisma.cognitiveAssignment.findUniqueOrThrow({where:{id:fixture.assignmentId}})
 await prisma.cognitiveAssignment.update({where:{id:assignment.id},data:{maxAttempts:20}})
 const expiry=new Date(Date.now()+3600000).toISOString()
 async function composition(name,publicMode=false,formFirst=false){let d=await teacher.request('/questionnaire-products','POST',{requestId:randomUUID(),name,questionnaireType:publicMode?'GENERAL':'COURSE',courseIds:publicMode?[]:[fixture.courses[0].id],publicEnabled:publicMode,...(publicMode?{expiresAt:expiry}:{})});if(formFirst)d=await teacher.request(`/questionnaire-products/${d.id}/items`,'POST',{revision:d.revision,item:{type:'FORM',formType:'text_input',formLabel:'Accepted before cognitive admission',required:true}});d=await teacher.request(`/questionnaire-products/${d.id}/items`,'POST',{revision:d.revision,item:{type:'COGNITIVE',cognitiveAssignmentId:assignment.id}});return teacher.request(`/questionnaire-products/${d.id}/publish`,'POST',{revision:d.revision})}
 const freshCourse=await composition('C10 unused course')
 const course=await composition('C10 course'),publicProduct=await composition('C10 public',true),shellProduct=await composition('C10 shell',false,true)
 const publicLink=await teacher.request(`/composite-assessments/${publicProduct.id}/public-tokens`,'POST',{expiresAt:expiry,maxUses:10})
 const cognitiveLink=await teacher.request(`/cognitive/assignments/${assignment.id}/public-tokens`,'POST',{expiresAt:expiry,maxUses:10})
 const standalone=await student.request('/cognitive/sessions','POST',{assignmentId:assignment.id})
 const started=await student.request(`/composite-assessments/${course.id}/attempts`,'POST',{}),embedded=started.attempt.currentItem.cognitiveSession
 const shell=await student.request(`/composite-assessments/${shellProduct.id}/attempts`,'POST',{})
 const shellRow=await prisma.cognitiveSession.findFirstOrThrow({where:{compositeAttemptId:shell.attempt.id}});assert.equal(shellRow.frozenAdmissionSnapshotHash,null)
 const anonymous=await anon.request(`/public/composite-assessments/${publicLink.token}/start`,'POST',{})
 const publicStandalone=await anon.request(`/public/cognitive/assignments/${cognitiveLink.token}/start`,'POST',{startIntent:randomBytes(32).toString('base64url')})
 for(const id of [standalone.sessionId,embedded.sessionId,anonymous.attempt.currentItem.cognitiveSession.sessionId,publicStandalone.session.sessionId])assert.ok((await prisma.cognitiveSession.findUniqueOrThrow({where:{id}})).frozenAdmissionSnapshotHash)
 const historical=final(publicStandalone.session)
 await anon.request(`/public/cognitive/sessions/${publicStandalone.session.sessionId}/submit`,'POST',{...historical,recoveryToken:publicStandalone.recoveryToken})
 check('ON: ordinary/public/standalone first delivery persists real admission; later child remains unadmitted shell')
 const off=await api(false,'api-off');teacher.url=student.url=anon.url=off
 assert.equal((await student.request('/capabilities')).cognitive,false)
 assert.deepEqual((await teacher.request('/questionnaire-products/resources')).cognitive,[])
 assert.deepEqual((await teacher.request('/cognitive/tests')).list,[]);assert.deepEqual((await teacher.request('/cognitive/configs')).list,[])
 check('OFF: server capabilities, test/config catalog and questionnaire resources hide new cognitive offerings')
 const fresh=await teacher.request('/questionnaire-products','POST',{requestId:randomUUID(),name:'OFF noncognitive draft',questionnaireType:'COURSE',courseIds:[fixture.courses[0].id],publicEnabled:false})
 await noWrites('OFF new authoring/start/restart rejected without parent/session/job/token-use/quota consumption',async()=>{
  await teacher.request(`/questionnaire-products/${fresh.id}/items`,'POST',{revision:fresh.revision,item:{type:'COGNITIVE',cognitiveAssignmentId:assignment.id}},400)
  await teacher.request(`/questionnaire-products/${course.id}/copy`,'POST',{requestId:randomUUID()},400)
  await teacher.request('/cognitive/assignments','POST',{courseId:fixture.courses[0].id,configId:assignment.configId,title:'Rejected',profile:'standard'},400)
  await teacher.request(`/cognitive/assignments/${assignment.id}/public-tokens`,'POST',{expiresAt:expiry,maxUses:5},400)
  await teacher.request(`/composite-assessments/${publicProduct.id}/public-tokens`,'POST',{expiresAt:expiry,maxUses:5},400)
  await student.request(`/composite-assessments/${freshCourse.id}/attempts`,'POST',{},400)
  await anon.request(`/public/composite-assessments/${publicLink.token}/start`,'POST',{},400)
  await anon.request(`/public/cognitive/assignments/${cognitiveLink.token}/start`,'POST',{startIntent:randomBytes(32).toString('base64url')},400)
  await student.request(`/cognitive/sessions/${standalone.sessionId}/restart`,'POST',{},400)
  await student.request(`/composite-assessments/attempts/${started.attempt.id}/restart`,'POST',{},400)
  await anon.request(`/public/composite-assessments/attempts/${anonymous.attempt.id}/restart`,'POST',{recoveryToken:anonymous.recoveryToken},400)
 })
 await noWrites('OFF true admitted sessions and public recovery remain readable without new admission records',async()=>{
  assert.equal((await student.request('/cognitive/sessions','POST',{assignmentId:assignment.id})).sessionId,standalone.sessionId)
  await student.request(`/cognitive/sessions/${standalone.sessionId}`)
  await student.request(`/composite-assessments/${course.id}/attempts`,'POST',{})
  await anon.request(`/public/composite-assessments/${publicLink.token}/start`,'POST',{recoveryToken:anonymous.recoveryToken})
  await anon.request(`/public/cognitive/assignments/${cognitiveLink.token}/start`,'POST',{recoveryToken:publicStandalone.recoveryToken})
  await anon.request(`/public/cognitive/sessions/${publicStandalone.session.sessionId}/submit`,'POST',{...historical,recoveryToken:publicStandalone.recoveryToken})
 })
 await noWrites('OFF unadmitted shell cannot start via direct session read/FINAL; owner and epoch remain enforced',async()=>{
  await student.request(`/cognitive/sessions/${shellRow.id}`,'GET',undefined,400)
  await teacher.request(`/cognitive/sessions/${standalone.sessionId}`,'GET',undefined,403)
  await student.request(`/cognitive/sessions/${shellRow.id}/submit`,'POST',{...final(standalone),definitionHash:'not-admitted'},409)
  await student.request(`/cognitive/sessions/${standalone.sessionId}/submit`,'POST',{...final(standalone),attemptEpoch:99},409)
 })
 const standaloneFinal=final(standalone),embeddedFinal=final(embedded)
 await student.request(`/cognitive/sessions/${standalone.sessionId}/submit`,'POST',standaloneFinal)
 await student.request(`/cognitive/sessions/${standalone.sessionId}/submit`,'POST',standaloneFinal)
 await student.request(`/cognitive/sessions/${embedded.sessionId}/submit`,'POST',embeddedFinal)
 await student.request(`/composite-assessments/attempts/${started.attempt.id}`)
 for(let i=0;i<60;i++){const r=await student.request(`/composite-assessments/attempts/${started.attempt.id}/report-status`);if(r.reportStatus?.state==='READY')break;if(i===59)throw Error('report not ready');await pause(250)}
 await student.request(`/composite-assessments/attempts/${started.attempt.id}/report`)
 await teacher.request(`/composite-assessments/${course.id}/attempts/${started.attempt.id}/report`)
 await student.request(`/cognitive/sessions/${standalone.sessionId}`);await student.request('/cognitive/history')
 check('OFF: admitted FINAL and replay complete; shared report worker finishes; participant/teacher/standalone history remains readable')
 await noWrites('OFF completed standalone new start still denied with counts unchanged',async()=>{await student.request('/cognitive/sessions','POST',{assignmentId:assignment.id},400)})
 const section=shell.attempt.currentItem
 const formPayload={submissionId:randomUUID(),attemptEpoch:shell.attempt.attemptEpoch,definitionHash:section.definitionHash,contextSnapshotHash:shell.attempt.contextSnapshotHash,answers:section.answers.map(item=>({formItemId:item.formItemId,value:'C10 preserved fact'}))}
 await student.request(`/composite-assessments/attempts/${shell.attempt.id}/form-sections/${section.id}/submit`,'POST',formPayload)
 await student.request(`/composite-assessments/attempts/${shell.attempt.id}`,'GET',undefined,409)
 const afterForm=await prisma.compositeFormSectionAttempt.findFirstOrThrow({where:{attemptId:shell.attempt.id}});assert.equal(afterForm.status,'COMPLETED')
 assert.equal((await prisma.cognitiveSession.findUniqueOrThrow({where:{id:shellRow.id}})).frozenAdmissionSnapshotHash,null)
 check('OFF reaching unadmitted cognitive child pauses explicitly and preserves accepted preceding Form facts')
 const reenabled=await api(true,'api-reenabled');teacher.url=student.url=anon.url=reenabled
 assert.equal((await student.request('/capabilities')).cognitive,true)
 assert.ok((await teacher.request('/questionnaire-products/resources')).cognitive.length)
 const resumed=await student.request(`/composite-assessments/attempts/${shell.attempt.id}`)
 assert.equal(resumed.currentItem.cognitiveSession.sessionId,shellRow.id)
 assert.ok((await prisma.cognitiveSession.findUniqueOrThrow({where:{id:shellRow.id}})).frozenAdmissionSnapshotHash)
 await student.request(`/cognitive/sessions/${shellRow.id}/submit`,'POST',final(resumed.currentItem.cognitiveSession))
 await anon.request(`/public/composite-assessments/${publicLink.token}/start`,'POST',{})
 await student.request('/cognitive/sessions','POST',{assignmentId:assignment.id})
 check('REENABLED: original shell resumes without replacement, old facts retained, ordinary/public new admission works')
 const originalConfig=await prisma.cognitiveTestConfig.findUniqueOrThrow({where:{id:assignment.configId}})
 try {
  await prisma.cognitiveTestConfig.update({where:{id:assignment.configId},data:{engineVersion:'broken-fixture-version'}})
  const resourceError=await teacher.request('/questionnaire-products/resources','GET',undefined,400)
  const configError=await teacher.request('/cognitive/configs','GET',undefined,400)
  assert.match(resourceError.message,/目录配置不可用/);assert.match(configError.message,/目录配置不可用/)
  assert.ok(!JSON.stringify(resourceError).includes('broken-fixture-version'))
 } finally { await prisma.cognitiveTestConfig.update({where:{id:assignment.configId},data:{engineVersion:originalConfig.engineVersion}}) }
 check('Catalog configuration errors are visible and sanitized, never successful empty lists')
 passed=true
}finally{
 await prisma.$disconnect();const cleanup=[]
 for(const child of children.reverse()){if(child.exitCode===null){child.kill('SIGTERM');for(let i=0;i<100&&child.exitCode===null;i++)await pause(100);if(child.exitCode===null){child.kill('SIGKILL');await new Promise(r=>child.once('exit',r))}}cleanup.push({pid:child.pid,stopped:child.exitCode!==null||child.signalCode!==null})}
 for(const fd of logs)fs.closeSync(fd)
 fs.writeFileSync(path.join(state,'c10-http-result.json'),JSON.stringify({passed,checks,counts,requests,cleanup},null,2))
}
