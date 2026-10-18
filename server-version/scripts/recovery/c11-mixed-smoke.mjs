/** C11 bounded mixed Form / C09 Scale timing / uploaded SJT HTTP qualification. No production credentials or direct answer writes.
 * Run only via c11-sjt-http.py under the coordinator's measurement lock.
 * Raw-response fixture follows existing vnext-capture-fixture; runtime helpers use dist.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID, createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../backend')
const require=createRequire(path.join(backend,'package.json'))
const {prisma}=require(path.join(backend,'dist/config/database.js'))
const {compileSjtTemplate}=require(path.join(backend,'dist/modules/situational/authoring/template.js'))
const {decryptUnifiedRuntimePayload}=require(path.join(backend,'dist/modules/assessment-runtime/security.js'))
const {parseCanonicalUnitResultEnvelope}=require(path.join(backend,'dist/modules/assessment-runtime/unit-result.js'))
const {deriveSituationalAssignment,assignedSituationalDefinition}=require(path.join(backend,'dist/modules/situational/situation-assignment.js'))
const {hashSituationRuntimeDefinition}=require(path.join(backend,'dist/modules/situational/situation-runtime-definition.js'))
const {situationalResponseHistoryIdentities}=require(path.join(backend,'dist/modules/situational/situation-research-capture.js'))
// Synthetic response generator, mirrored from the current vnext capture fixture.
function captureFixture(source, attemptId) {
  const definitionHash = hashSituationRuntimeDefinition(source), assignment = deriveSituationalAssignment(source, attemptId, definitionHash)
  const definition = assignedSituationalDefinition(source, assignment)
  const responses = [], events = []
  let nodeKey = definition.flow.entryNodeKey, time = 0
  while (true) {
    const node = definition.flow.nodes.find(n => n.nodeKey === nodeKey)
    if (node.nodeType === 'TERMINAL') break
    const scene = definition.scenes.find(s => s.sceneKey === node.sceneKey)
    const historyIdentity = situationalResponseHistoryIdentities(definition, responses).get(scene.sceneKey)
    events.push({ type: 'NODE_EXPOSED', nodeKey, historyIdentity, relativeTimeMs: time++ })
    const stages = node.responseStages ?? [{ stageKey: 'unstaged', kind: 'CHOICE', channelKeys: scene.channels.map(c => c.channelKey) }]
    for (const stage of stages) {
      if (stage.kind !== 'CHOICE') events.push({ type: 'PROBE_EXPOSED', nodeKey, stageKey: stage.stageKey, historyIdentity, relativeTimeMs: time++ })
      for (const channelKey of stage.channelKeys) {
        const channel = scene.channels.find(c => c.channelKey === channelKey)
        if (node.channelPolicies?.find(p => p.channelKey === channelKey)?.required === false) continue
        const responseValue = channel.responseType === 'SINGLE_CHOICE' ? 'A' : 80
        const response = { sceneKey: scene.sceneKey, channelKey, responseValue, historyIdentity, responseRevision: 1, ...(node.responseStages ? { stageConfirmed: true } : {}) }
        responses.push(response)
        events.push({ type: 'RESPONSE_FIRST_COMMITTED', nodeKey, channelKey, responseValue, historyIdentity, responseRevision: 1, relativeTimeMs: time++, ...(node.responseStages ? { stageKey: stage.stageKey } : {}) })
      }
      if (node.responseStages) events.push({ type: 'STAGE_CONFIRMED', nodeKey, stageKey: stage.stageKey, historyIdentity, relativeTimeMs: time++ })
    }
    events.push({ type: 'NODE_CONFIRMED', nodeKey, historyIdentity, relativeTimeMs: time++ })
    nodeKey = node.transition.type === 'NEXT' ? node.transition.nextNodeKey : node.transition.branches.find(b => b.optionKey === 'A').nextNodeKey
  }
  const capture = { captureVersion: 'situational-capture-v1', definitionHash, assignmentIdentity: assignment.assignmentIdentity, events }
  return { definition, definitionHash, assignment, responses, capture }
}

const bcrypt=require('bcryptjs')
const state=process.argv[2],status=JSON.parse(fs.readFileSync(path.join(state,'status.json'))),fixture=JSON.parse(fs.readFileSync(path.join(state,'fixture-private.json')))
assert.equal(new URL(status.apiUrl).hostname,'127.0.0.1')
assert.equal(process.env.NODE_ENV,'test')
assert.match(process.env.DATABASE_URL,/eduk12_runtime:.*@127\.0\.0\.1:\d+\/eduk12_recovery/)
const checks=[],requests=[],counts=[];let passed=false
const check=name=>{checks.push(name);console.log('PASS',name)}
const pause=ms=>new Promise(r=>setTimeout(r,ms))
function client(){const cookies=new Map();return {recovery:null,async request(route,method='GET',body,expected=200,raw=false){
 const multipart=body instanceof FormData, wire=body===undefined?undefined:multipart?body:JSON.stringify(body)
 const response=await fetch(status.apiUrl+'/api'+route,{method,signal:AbortSignal.timeout(25000),headers:{...(!multipart?{'content-type':'application/json'}:{}),...(cookies.size?{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(cookies.has('ptool_csrf')?{'x-csrf-token':cookies.get('ptool_csrf')}:{}),...(this.recovery?{'x-recovery-token':this.recovery}:{})},...(wire===undefined?{}:{body:wire})})
 for(const c of response.headers.getSetCookie()){const pair=c.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
 const bytes=Buffer.from(await response.arrayBuffer());requests.push({route:route.replace(/\/public\/composite-assessments\/[^/]+\/start/,'/public/composite-assessments/[token]/start'),method,status:response.status,bytes:bytes.length})
 assert.ok((Array.isArray(expected)?expected:[expected]).includes(response.status),`${method} ${route}: ${response.status} ${bytes.toString().slice(0,500)}`)
 if(raw)return bytes
 const data=JSON.parse(bytes.toString());if(response.status!==200)return data
 assert.equal(data.code,0,`${route}: ${data.message}`);return data.data
 },async login(who,role){await this.request('/auth/csrf');await this.request(role==='ADMIN'?'/auth/login':'/auth/training-login','POST',role==='ADMIN'?who:{...who,expectedRole:role})}}}
const teacher=client(),admin=client(),student=client(),outsider=client(),otherTeacher=client()
const auth='/situational/authoring',prefix='/composite-assessments'
const template=JSON.parse(fs.readFileSync(path.join(backend,'src/modules/situational/authoring/examples/teacher-demonstration.json')))
async function upload(actor,respondentType){const input={...structuredClone(template),instrumentKey:'c11-'+randomUUID(),respondentType,title:'C11 synthetic '+respondentType};const form=new FormData();form.append('file',new Blob([JSON.stringify(input)],{type:'application/json'}),'c11-synthetic.json');const d=await actor.request(auth+'/drafts','POST',form);assert.equal(d.template.respondentType,respondentType);return d}
const reviewBody=d=>({revision:d.revision,contentDigest:d.contentDigest})
async function release(d,owner=teacher){await owner.request(`${auth}/drafts/${d.id}/request-review`,'POST',reviewBody(d));await admin.request(`${auth}/drafts/${d.id}/review`,'POST',{...reviewBody(d),approve:true,note:'Independent synthetic C11 review'});return d}
async function composition(key,version='1.0.0',courseId=fixture.courses[0].id,publicMode=false){let d=await teacher.request('/questionnaire-products','POST',{requestId:randomUUID(),name:'C11 synthetic course SJT',questionnaireType:'COURSE',courseIds:[courseId],publicEnabled:publicMode,...(publicMode?{expiresAt:new Date(Date.now()+3600000).toISOString()}:{})});d=await teacher.request(`/questionnaire-products/${d.id}/items`,'POST',{revision:d.revision,item:{type:'SITUATIONAL',situationalInstrumentKey:key,situationalInstrumentVersion:version}});assert.equal((await teacher.request(`/questionnaire-products/${d.id}/preflight`,'POST',{revision:d.revision})).ok,true);return teacher.request(`/questionnaire-products/${d.id}/publish`,'POST',{revision:d.revision})}
const embeddedRoute=(a,p=prefix)=>`${p}/attempts/${a.id}/items/${a.currentItem.id}/situational/${a.currentItem.situationalAttemptId}`
async function payload(a,d,c=student,p=prefix){const runtime=await c.request(embeddedRoute(a,p));assert.equal(runtime.attemptId,a.currentItem.situationalAttemptId);const source=compileSjtTemplate(d.template).package.definition;const capture=captureFixture(source,runtime.attemptId);return {submissionId:randomUUID(),attemptEpoch:runtime.attempt.attemptEpoch,definitionHash:runtime.attempt.definitionHash,compiledRuntimeHash:runtime.attempt.compiledRuntimeHash,scoringVersion:runtime.attempt.scoringVersion,responses:capture.responses,researchCapture:capture.capture}}
async function report(c,a,p=prefix){for(let i=0;i<120;i++){const r=await c.request(`${p}/attempts/${a.id}/report-status`);if(r.reportStatus?.state==='READY'){const first=await c.request(`${p}/attempts/${a.id}/report`);assert.deepEqual(await c.request(`${p}/attempts/${a.id}/report`),first);return first}await pause(250)}throw Error('C11 report timeout')}
async function census(){return {parents:await prisma.compositeAssessmentAttempt.count(),children:await prisma.situationalAttempt.count(),jobs:await prisma.compositeReportJob.count()}}
async function noWrites(name,fn,id){const before=await census(id);await fn();const after=await census(id);assert.deepEqual(after,before,name);counts.push({name,before,after});check(name)}
function parseCsv(bytes){const text=bytes.toString('utf8').replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=''}else cell+=c}if(row.length||cell)rows.push([...row,cell]);assert.equal(quoted,false);return rows}
function unzip(bytes){const files={};let offset=0;while(bytes.readUInt32LE(offset)===0x04034b50){assert.equal(bytes.readUInt16LE(offset+8),0);const length=bytes.readUInt32LE(offset+18),names=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),start=offset+30+names+extra;files[bytes.subarray(offset+30,offset+30+names).toString()]=bytes.subarray(start,start+length);offset=start+length}return files}
async function mixedExport(product,expectedAttempts){
 const queued=await teacher.request(`${prefix}/${product.id}/export`,'POST',{detail:'full',format:'csv'})
 assert.equal(queued.artifacts.length,1);const url=queued.artifacts[0].downloadUrl.replace(/^\/api/,'')
 for(let i=0;i<120;i++){const current=await teacher.request(url+'/status');if(current.status==='READY')break;assert.notEqual(current.status,'FAILED');if(i===119)throw Error('Mixed export timeout');await pause(250)}
 const bytes=await teacher.request(url,'GET',undefined,200,true),[columns,...rows]=parseCsv(bytes)
 assert.equal(rows.length,expectedAttempts.length);assert.ok(!columns.some(c=>c.includes('TIMING_')),'default export must not disclose C09 timing')
 assert.ok(columns.includes('J003_result_hash'));assert.ok(columns.includes('S002_SCORE_total'))
 for(const a of expectedAttempts){const row=Object.fromEntries(columns.map((c,i)=>[c,rows.find(r=>r[columns.indexOf('A_attempt_id')]===a.id)?.[i]]))
  assert.equal(row.A_attempt_id,a.id);assert.equal(Number(row.S002_SCORE_total),1)
  const snap=await prisma.assessmentUnitSnapshot.findFirstOrThrow({where:{compositeAttemptId:a.id,unitType:'SITUATIONAL'}})
  const result=parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload(snap.canonicalResultEncrypted));assert.equal(row.J003_result_hash,result.resultHash)
 }
 check('Original mixed export queue retains Scale/SJT results while withholding unapproved timing columns')
}
try{
 await teacher.login(fixture.teacher,'TEACHER');await admin.login(fixture.admin,'ADMIN');await student.login(fixture.student,'STUDENT')
 // Only synthetic account/course membership is seeded. Upload, authoring and all
 // answer persistence still travel through their real HTTP APIs.
 const course=await prisma.course.create({data:{creatorId:fixture.teacher.username,title:'C11 mixed Training fixture',courseCode:'C11-mixed-'+randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
 await prisma.courseStudent.create({data:{courseId:course.id,studentId:fixture.student.username,status:'ACTIVE'}})
 const d=await release(await upload(teacher,'student_self_report'))
 let product=await teacher.request('/questionnaire-products','POST',{requestId:randomUUID(),name:'C11 Form Scale timing SJT',questionnaireType:'COURSE',courseIds:[course.id],trainingTimingEnabled:true,publicEnabled:true,expiresAt:new Date(Date.now()+3600000).toISOString()})
 assert.equal(product.timingExportEnabled,false)
 for(const item of [{type:'FORM',formType:'text_input',formLabel:'Mixed synthetic reflection',required:true},{type:'SCALE',scaleId:fixture.scaleId,required:true},{type:'SITUATIONAL',situationalInstrumentKey:d.template.instrumentKey,situationalInstrumentVersion:'1.0.0',required:true}])product=await teacher.request(`/questionnaire-products/${product.id}/items`,'POST',{revision:product.revision,item})
 assert.equal((await teacher.request(`/questionnaire-products/${product.id}/preflight`,'POST',{revision:product.revision})).ok,true)
 product=await teacher.request(`/questionnaire-products/${product.id}/publish`,'POST',{revision:product.revision})
 const completed=[]
 for(const anonymous of [false,true]){
  const c=anonymous?client():student,p=anonymous?'/public/composite-assessments':prefix;let a
  if(anonymous){await c.request('/auth/csrf');const token=await teacher.request(`${prefix}/${product.id}/public-tokens`,'POST',{expiresAt:new Date(Date.now()+1800000).toISOString(),maxUses:2});const started=await c.request(`${p}/${token.token}/start`,'POST',{});c.recovery=started.recoveryToken;a=started.attempt;assert.equal((await c.request(`${p}/${token.token}/start`,'POST',{recoveryToken:c.recovery})).attempt.id,a.id)}
  else ({attempt:a}=await c.request(`${prefix}/${product.id}/attempts`,'POST',{}))
  const frozen=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:a.id}})
  assert.equal(frozen.trainingTimingSnapshot.course.courseId,course.id);assert.equal(frozen.trainingTimingSnapshot.course.courseType,'TRAINING_COURSE')
  const form=a.currentItem;assert.equal(form.type,'FORM_SECTION')
  const formFinal={submissionId:randomUUID(),attemptEpoch:a.attemptEpoch,definitionHash:form.definitionHash,contextSnapshotHash:a.contextSnapshotHash,answers:form.answers.map(item=>({formItemId:item.formItemId,value:'C11 mixed persisted reflection'}))}
  const formRoute=`${p}/attempts/${a.id}/form-sections/${form.id}/submit`
  await c.request(formRoute,'POST',formFinal);assert.equal((await c.request(formRoute,'POST',formFinal)).replayed,true)
  a=await c.request(`${p}/attempts/${a.id}`);const scale=a.currentItem;assert.equal(scale.type,'SCALE');assert.ok(scale.trainingTiming)
  const timing={schemaVersion:1,firstResponseMs:120,activeTimeMs:200,changeCount:1,revisitCount:0,visits:1,interrupted:true,recoveredWithoutClock:false}
  const scaleFinal={submissionId:randomUUID(),attemptEpoch:a.attemptEpoch,definitionHash:scale.definitionHash,contextSnapshotHash:a.contextSnapshotHash,answers:[{itemCode:'mixed-scale-item-1',responseValue:'yes',responseTimeMs:17}],itemTimings:{'mixed-scale-item-1':timing}}
  const scaleRoute=`${p}/attempts/${a.id}/items/${scale.id}/scale/submit`
  await c.request(scaleRoute,'POST',scaleFinal);assert.equal((await c.request(scaleRoute,'POST',scaleFinal)).replayed,true)
  const storedScale=await prisma.assessment.findUniqueOrThrow({where:{id:scale.scaleAssessmentId}})
  const fact=decryptUnifiedRuntimePayload(storedScale.timingEncrypted);assert.equal(fact.status,'RECORDED');assert.deepEqual(fact.items['mixed-scale-item-1'],timing)
  a=await c.request(`${p}/attempts/${a.id}`);assert.equal(a.currentItem.type,'SITUATIONAL')
  const sjtFinal=await payload(a,d,c,p),sjtRoute=embeddedRoute(a,p)+'/submit'
  await c.request(sjtRoute,'POST',sjtFinal);assert.equal((await c.request(sjtRoute,'POST',sjtFinal)).replayed,true)
  const snapshots=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:a.id,attemptEpoch:a.attemptEpoch}})
  assert.equal(snapshots.length,3);assert.deepEqual(snapshots.map(s=>s.unitType).sort(),['FORM_SECTION','SCALE','SITUATIONAL'])
  assert.ok(snapshots.every(s=>s.terminalState==='COMPLETED'))
  const sjt=snapshots.find(s=>s.unitType==='SITUATIONAL'),canonical=parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload(sjt.canonicalResultEncrypted))
  assert.equal(canonical.core.metrics.find(m=>m.key==='E')?.value,3)
  const participantReport=await report(c,a,p);assert.ok(!JSON.stringify(participantReport).includes('trainingTiming'))
  const ownerReport=await teacher.request(`${prefix}/${product.id}/attempts/${a.id}/report`);assert.ok(!JSON.stringify(ownerReport).includes('trainingTiming'))
  completed.push(a);check(`${anonymous?'Anonymous public':'Course member'} mixed Form→Scale timing→uploaded SJT: FINAL/replay, frozen Training course, exact 200ms, three snapshots, original reports`)
 }
 await mixedExport(product,completed)
 passed=true
}catch(error){console.error(error);throw error}finally{await prisma.$disconnect();fs.writeFileSync(path.join(state,'c11-mixed-result.json'),JSON.stringify({passed,checks,requests,counts},null,2))}
process.exit(0)
